/**
 * Cliente UCI minimo para hablar con un binario de Stockfish nativo por stdin/stdout.
 * Sin librerias WASM, sin servicios externos: se levanta el binario como proceso hijo
 * (docs/ANALYSIS-SPEC.md, "Que es Stockfish y que hace aca").
 *
 * `spawnFn` es inyectable, igual que `ChesscomClient.fetchImpl` (lib/chess/chesscom.ts): en
 * produccion levanta el proceso real, en los tests recibe un "motor simulado" que responde
 * lineas UCI guionadas, sin depender de que el binario este instalado.
 */
import { spawn as nodeSpawn } from 'node:child_process';

export type EngineProcess = {
  stdin: { write(data: string): void };
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): void };
  kill(): void;
};

export type SpawnFn = (enginePath: string) => EngineProcess;

const defaultSpawn: SpawnFn = (enginePath) => nodeSpawn(enginePath, [], { stdio: ['pipe', 'pipe', 'ignore'] });

/**
 * La linea principal de un `info`. En UCI, `pv` es SIEMPRE el ultimo campo de la linea, asi que
 * todo lo que viene despues son jugadas. Devuelve null si esa linea no trae `pv`.
 */
function extraerPv(line: string): string[] | null {
  const marca = / pv /.exec(line);
  if (!marca) return null;
  const jugadas = line
    .slice(marca.index + marca[0].length)
    .trim()
    .split(/\s+/)
    .filter((jugada) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(jugada));
  return jugadas.length > 0 ? jugadas : null;
}

export type EvalResult = {
  /** Centipeones, EN PERSPECTIVA DEL QUE MUEVE (cruda de UCI). Normalizar es trabajo de lib/analysis/. */
  scoreCp: number | null;
  /** Jugadas hasta el mate, positivo si mueve el que gana. null si no hay mate en la linea principal. */
  mateIn: number | null;
  /** null cuando la posicion no tiene jugadas legales (jaque mate o ahogado): el motor responde "bestmove (none)". */
  bestUci: string | null;
  /**
   * Linea principal completa en UCI, de la mas profunda antes de `bestmove`. `bestUci` es su
   * primer elemento.
   *
   * Es lo que hace posible un ejercicio de varias jugadas y una explicacion de por que la jugada
   * fue mala: la linea que sigue a un blunder ES la refutacion, es decir como te castigaba el
   * rival. El motor ya la manda en cada `info`; antes se leia solo el primer token y el resto se
   * tiraba.
   */
  pv: string[];
};

export class UciEngine {
  private readonly process: EngineProcess;
  private buffer = '';
  private readonly waiters: Array<(line: string) => void> = [];
  private readonly pendingLines: string[] = [];
  /** Nombre crudo que devuelve el motor en `id name`. Vacio hasta llamar start(). */
  engineName = '';

  constructor(enginePath: string, spawnFn: SpawnFn = defaultSpawn) {
    this.process = spawnFn(enginePath);
    this.process.stdout.on('data', (chunk) => this.onData(chunk.toString()));
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx = this.buffer.indexOf('\n');
    while (idx !== -1) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(idx + 1);
      const waiter = this.waiters.shift();
      if (waiter) waiter(line);
      else this.pendingLines.push(line);
      idx = this.buffer.indexOf('\n');
    }
  }

  private nextLine(): Promise<string> {
    const queued = this.pendingLines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private send(command: string): void {
    this.process.stdin.write(`${command}\n`);
  }

  /** Lee lineas hasta que `predicate` de true. `onLine` se llama con cada linea, incluida la final. */
  private async readUntil(predicate: (line: string) => boolean, onLine?: (line: string) => void): Promise<string> {
    for (;;) {
      const line = await this.nextLine();
      onLine?.(line);
      if (predicate(line)) return line;
    }
  }

  async start(): Promise<void> {
    this.send('uci');
    await this.readUntil(
      (line) => line === 'uciok',
      (line) => {
        const match = /^id name (.+)$/.exec(line);
        if (match?.[1]) this.engineName = match[1].trim();
      },
    );
  }

  async configure(options: { threads: number; hashMb: number }): Promise<void> {
    this.send(`setoption name Threads value ${options.threads}`);
    this.send(`setoption name Hash value ${options.hashMb}`);
    this.send('isready');
    await this.readUntil((line) => line === 'readyok');
  }

  /**
   * Evalua la posicion resultante de reproducir `uciMoves` desde la posicion inicial.
   * `nodes` es el presupuesto fijo (docs/ANALYSIS-SPEC.md: nodos fijos, no tiempo ni profundidad).
   */
  async evaluate(uciMoves: readonly string[], nodes: number): Promise<EvalResult> {
    const movesPart = uciMoves.length > 0 ? ` moves ${uciMoves.join(' ')}` : '';
    this.send(`position startpos${movesPart}`);

    let scoreCp: number | null = null;
    let mateIn: number | null = null;
    let pv: string[] = [];

    this.send(`go nodes ${nodes}`);
    const bestmoveLine = await this.readUntil(
      (line) => line.startsWith('bestmove'),
      (line) => {
        // Se queda con la ULTIMA linea de score antes de bestmove: es la de mayor profundidad.
        const mateMatch = /score mate (-?\d+)/.exec(line);
        const cpMatch = /score cp (-?\d+)/.exec(line);
        if (mateMatch?.[1]) {
          mateIn = Number.parseInt(mateMatch[1], 10);
          scoreCp = null;
        } else if (cpMatch?.[1]) {
          scoreCp = Number.parseInt(cpMatch[1], 10);
          mateIn = null;
        }
        const linea = extraerPv(line);
        if (linea) pv = linea;
      },
    );

    const rawBestUci = bestmoveLine.split(' ')[1] ?? '';
    const bestUci = rawBestUci === '(none)' ? null : rawBestUci;
    return { scoreCp, mateIn, bestUci, pv };
  }

  /**
   * Evalua la posicion con multiples lineas principales (Fase 4: filtro de calidad de
   * ejercicios, docs/ANALYSIS-SPEC.md). A diferencia de `evaluate()`, deja `MultiPV` en `lines`
   * en vez de 1, y lo vuelve a dejar en 1 al terminar para no afectar evaluaciones posteriores
   * con la misma instancia. Devuelve las lineas ordenadas por indice de MultiPV (1 = mejor).
   */
  async evaluateMultiPv(uciMoves: readonly string[], nodes: number, lines: number): Promise<EvalResult[]> {
    this.send(`setoption name MultiPV value ${lines}`);
    const movesPart = uciMoves.length > 0 ? ` moves ${uciMoves.join(' ')}` : '';
    this.send(`position startpos${movesPart}`);

    const byRank = new Map<number, EvalResult>();

    this.send(`go nodes ${nodes}`);
    await this.readUntil(
      (line) => line.startsWith('bestmove'),
      (line) => {
        const rankMatch = /multipv (\d+)/.exec(line);
        if (!rankMatch?.[1]) return;
        const rank = Number.parseInt(rankMatch[1], 10);
        const pv = extraerPv(line);
        if (!pv?.[0]) return;
        const mateMatch = /score mate (-?\d+)/.exec(line);
        const cpMatch = /score cp (-?\d+)/.exec(line);
        if (mateMatch?.[1]) {
          byRank.set(rank, { scoreCp: null, mateIn: Number.parseInt(mateMatch[1], 10), bestUci: pv[0], pv });
        } else if (cpMatch?.[1]) {
          byRank.set(rank, { scoreCp: Number.parseInt(cpMatch[1], 10), mateIn: null, bestUci: pv[0], pv });
        }
      },
    );

    this.send('setoption name MultiPV value 1');

    return [...byRank.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, result]) => result);
  }

  /**
   * `engine_id` NUNCA se hardcodea: el apt de Debian trae una version bastante mas vieja que
   * el brew de macOS, y hay que poder distinguirlas. Ej: `stockfish-16.1-800k-t7`.
   */
  buildEngineId({ nodes, threads }: { nodes: number; threads: number }): string {
    const slug = this.engineName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const nodesLabel = nodes >= 1000 ? `${Math.round(nodes / 1000)}k` : `${nodes}`;
    return `${slug || 'motor'}-${nodesLabel}-t${threads}`;
  }

  quit(): void {
    this.send('quit');
    this.process.kill();
  }
}
