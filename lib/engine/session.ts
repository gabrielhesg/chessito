/**
 * La logica UCI sobre un transporte cualquiera. No importa `node:` nada, asi que este modulo
 * SI se puede importar desde el navegador.
 *
 * `evaluate` y `evaluateMultiPv` son el contrato del analisis por lotes de GitHub Actions y no
 * cambiaron: presupuesto por nodos fijos (`go nodes`), un resultado al final. `searchStreaming`
 * se suma para el analisis interactivo del navegador, que necesita lo contrario — varias lineas
 * que se van refinando mientras el motor piensa.
 */
import {
  parseBestmove,
  parseIdName,
  parseInfo,
  type InfoParsed,
} from '@/lib/engine/protocol';
import type { UciTransport } from '@/lib/engine/transport';

export type EvalResult = {
  /** Centipeones, EN PERSPECTIVA DEL QUE MUEVE (cruda de UCI). Normalizar es trabajo de lib/analysis/. */
  scoreCp: number | null;
  /** Jugadas hasta el mate, positivo si mueve el que gana. null si no hay mate en la linea principal. */
  mateIn: number | null;
  /** null cuando la posicion no tiene jugadas legales (jaque mate o ahogado): "bestmove (none)". */
  bestUci: string | null;
  /**
   * Linea principal completa en UCI, la mas profunda antes de `bestmove`. `bestUci` es su primer
   * elemento.
   *
   * Es lo que hace posible un ejercicio de varias jugadas y explicar por que una jugada fue mala:
   * la linea que sigue a un blunder ES la refutacion.
   */
  pv: string[];
};

/** Una de las lineas que el motor esta calculando ahora mismo. */
export type EvalLine = {
  /** 1 = la mejor. */
  rank: number;
  scoreCp: number | null;
  mateIn: number | null;
  depth: number | null;
  pv: string[];
};

export type SearchHandle = {
  /** Detiene la busqueda y resuelve cuando el motor confirmo con `bestmove`. */
  stop(): Promise<void>;
};

export class UciSession {
  private readonly transport: UciTransport;
  private readonly waiters: Array<(line: string) => void> = [];
  private readonly pendingLines: string[] = [];
  /** Consumidor extra para la busqueda en streaming, que no consume del pipeline de waiters. */
  private streamListener: ((line: string) => void) | null = null;
  /** Nombre crudo que devuelve el motor en `id name`. Vacio hasta llamar start(). */
  engineName = '';

  constructor(transport: UciTransport) {
    this.transport = transport;
    this.transport.onLine((line) => this.onLine(line));
  }

  private onLine(line: string): void {
    if (this.streamListener) {
      this.streamListener(line);
      return;
    }
    const waiter = this.waiters.shift();
    if (waiter) waiter(line);
    else this.pendingLines.push(line);
  }

  private nextLine(): Promise<string> {
    const queued = this.pendingLines.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  protected send(command: string): void {
    this.transport.send(command);
  }

  /** Lee lineas hasta que `predicate` de true. `onLine` se llama con cada linea, incluida la final. */
  private async readUntil(
    predicate: (line: string) => boolean,
    onLine?: (line: string) => void,
  ): Promise<string> {
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
        const nombre = parseIdName(line);
        if (nombre) this.engineName = nombre;
      },
    );
  }

  async configure(options: { threads: number; hashMb: number }): Promise<void> {
    this.send(`setoption name Threads value ${options.threads}`);
    this.send(`setoption name Hash value ${options.hashMb}`);
    this.send('isready');
    await this.readUntil((line) => line === 'readyok');
  }

  private posicion(uciMoves: readonly string[]): string {
    return uciMoves.length > 0 ? `position startpos moves ${uciMoves.join(' ')}` : 'position startpos';
  }

  /**
   * Evalua la posicion resultante de reproducir `uciMoves` desde la posicion inicial.
   * `nodes` es el presupuesto fijo (docs/ANALYSIS-SPEC.md: nodos fijos, no tiempo ni profundidad).
   */
  async evaluate(uciMoves: readonly string[], nodes: number): Promise<EvalResult> {
    this.send(this.posicion(uciMoves));

    let scoreCp: number | null = null;
    let mateIn: number | null = null;
    let pv: string[] = [];

    this.send(`go nodes ${nodes}`);
    const bestmoveLine = await this.readUntil(
      (line) => line.startsWith('bestmove'),
      (line) => {
        const info = parseInfo(line);
        if (!info) return;
        // Se queda con la ULTIMA linea de score antes de bestmove: es la de mayor profundidad.
        if (info.tieneScore) {
          scoreCp = info.scoreCp;
          mateIn = info.mateIn;
        }
        if (info.pv) pv = info.pv;
      },
    );

    return { scoreCp, mateIn, bestUci: parseBestmove(bestmoveLine)?.bestUci ?? null, pv };
  }

  /**
   * Evalua la posicion con multiples lineas principales (Fase 4: filtro de calidad de
   * ejercicios). Deja `MultiPV` en `lines` y lo vuelve a dejar en 1 al terminar, para no afectar
   * evaluaciones posteriores con la misma instancia. Devuelve las lineas ordenadas (1 = mejor).
   */
  async evaluateMultiPv(uciMoves: readonly string[], nodes: number, lines: number): Promise<EvalResult[]> {
    this.send(`setoption name MultiPV value ${lines}`);
    this.send(this.posicion(uciMoves));

    const byRank = new Map<number, EvalResult>();

    this.send(`go nodes ${nodes}`);
    await this.readUntil(
      (line) => line.startsWith('bestmove'),
      (line) => {
        const info = parseInfo(line);
        if (!info?.pv?.[0] || !info.tieneScore) return;
        byRank.set(info.multipv, {
          scoreCp: info.scoreCp,
          mateIn: info.mateIn,
          bestUci: info.pv[0],
          pv: info.pv,
        });
      },
    );

    this.send('setoption name MultiPV value 1');

    return [...byRank.entries()].sort(([a], [b]) => a - b).map(([, result]) => result);
  }

  /**
   * Busqueda para el analisis interactivo: varias lineas que se van refinando, con `onUpdate` en
   * cada profundidad nueva.
   *
   * `go depth N` y NO `go infinite`: una busqueda infinita en un celular no termina nunca y se
   * come la bateria. La profundidad se auto-detiene y deja el motor libre.
   *
   * Quien llama DEBE esperar el `stop()` antes de arrancar la siguiente busqueda. Si no, los
   * `info` de la busqueda vieja se mezclan con los de la nueva y la pantalla muestra lineas de
   * otra posicion. Esa coordinacion vive en el hook, no aca.
   */
  searchStreaming(
    uciMoves: readonly string[],
    opciones: {
      depth: number;
      multiPv: number;
      onUpdate: (lines: readonly EvalLine[], depth: number) => void;
    },
  ): SearchHandle {
    const byRank = new Map<number, EvalLine>();
    let ultimaProfundidad = 0;
    let terminada = false;
    let resolverFin: (() => void) | null = null;

    const emitir = (): void => {
      const lineas = [...byRank.entries()].sort(([a], [b]) => a - b).map(([, l]) => l);
      opciones.onUpdate(lineas, ultimaProfundidad);
    };

    this.streamListener = (line: string) => {
      if (parseBestmove(line)) {
        terminada = true;
        this.streamListener = null;
        resolverFin?.();
        return;
      }
      const info: InfoParsed | null = parseInfo(line);
      if (!info?.pv?.[0] || !info.tieneScore) return;
      byRank.set(info.multipv, {
        rank: info.multipv,
        scoreCp: info.scoreCp,
        mateIn: info.mateIn,
        depth: info.depth,
        pv: info.pv,
      });
      // Se emite al completar cada profundidad, no en cada `info`: con MultiPV 3 son tres lineas
      // por profundidad y repintar en cada una es trabajo tirado.
      if (info.depth !== null && info.depth > ultimaProfundidad) {
        ultimaProfundidad = info.depth;
        emitir();
      } else if (info.multipv === opciones.multiPv) {
        emitir();
      }
    };

    this.send(`setoption name MultiPV value ${opciones.multiPv}`);
    this.send(this.posicion(uciMoves));
    this.send(`go depth ${opciones.depth}`);

    return {
      stop: () =>
        new Promise<void>((resolve) => {
          if (terminada) {
            resolve();
            return;
          }
          resolverFin = resolve;
          this.send('stop');
        }),
    };
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
    this.transport.dispose();
  }
}
