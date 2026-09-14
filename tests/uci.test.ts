import { describe, expect, it } from 'vitest';
import { UciEngine, type EngineProcess } from '@/lib/engine/uci';

/** Motor simulado: no se levanta ningun binario, solo se responden lineas UCI guionadas. */
class FakeEngineProcess implements EngineProcess {
  written: string[] = [];
  private listener: ((chunk: Buffer | string) => void) | null = null;
  killed = false;

  stdin = {
    write: (data: string) => {
      this.written.push(data);
    },
  };

  stdout = {
    on: (event: 'data', cb: (chunk: Buffer | string) => void) => {
      if (event === 'data') this.listener = cb;
    },
  };

  kill(): void {
    this.killed = true;
  }

  emit(line: string): void {
    this.listener?.(`${line}\n`);
  }
}

function startedEngine(): { engine: UciEngine; process: FakeEngineProcess } {
  const process = new FakeEngineProcess();
  const engine = new UciEngine('/usr/games/stockfish', () => process);
  return { engine, process };
}

describe('UciEngine', () => {
  it('start() lee id name y espera uciok', async () => {
    const { engine, process } = startedEngine();
    const startPromise = engine.start();
    process.emit('id name Stockfish 16.1');
    process.emit('id author the Stockfish developers');
    process.emit('uciok');
    await startPromise;

    expect(engine.engineName).toBe('Stockfish 16.1');
    expect(process.written).toContain('uci\n');
  });

  it('configure() manda Threads y Hash y espera readyok', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const configurePromise = engine.configure({ threads: 4, hashMb: 256 });
    process.emit('readyok');
    await configurePromise;

    expect(process.written).toContain('setoption name Threads value 4\n');
    expect(process.written).toContain('setoption name Hash value 256\n');
    expect(process.written).toContain('isready\n');
  });

  it('evaluate() manda position + go nodes, y se queda con el ultimo score antes de bestmove', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const evalPromise = engine.evaluate(['e2e4', 'e7e5'], 800000);
    process.emit('info depth 10 seldepth 12 score cp 25 nodes 100000');
    process.emit('info depth 18 seldepth 20 score cp 34 nodes 800000 pv d2d4 d7d5');
    process.emit('bestmove d2d4 ponder d7d5');
    const result = await evalPromise;

    expect(process.written).toContain('position startpos moves e2e4 e7e5\n');
    expect(process.written).toContain('go nodes 800000\n');
    expect(result).toEqual({ scoreCp: 34, mateIn: null, bestUci: 'd2d4' });
  });

  it('evaluate() sin jugadas previas manda position startpos sin "moves"', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const evalPromise = engine.evaluate([], 800000);
    process.emit('info depth 10 score cp 10');
    process.emit('bestmove e2e4');
    await evalPromise;

    expect(process.written).toContain('position startpos\n');
  });

  it('evaluate() reconoce score mate y deja scoreCp en null', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const evalPromise = engine.evaluate(['e2e4'], 800000);
    process.emit('info depth 5 score mate 3');
    process.emit('bestmove g1f3');
    const result = await evalPromise;

    expect(result).toEqual({ scoreCp: null, mateIn: 3, bestUci: 'g1f3' });
  });

  it('buildEngineId combina nombre, nodos e hilos sin hardcodear nada', async () => {
    const { engine, process } = startedEngine();
    process.emit('id name Stockfish 16.1');
    process.emit('uciok');
    await engine.start();

    expect(engine.buildEngineId({ nodes: 800000, threads: 7 })).toBe('stockfish-16-1-800k-t7');
  });

  it('evaluateMultiPv() manda MultiPV=N y separa las lineas por rango, restaurando MultiPV=1 al final', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const evalPromise = engine.evaluateMultiPv(['e2e4'], 800000, 2);
    process.emit('info depth 10 multipv 1 score cp 40 pv e7e5 g1f3');
    process.emit('info depth 10 multipv 2 score cp 35 pv c7c5 g1f3');
    process.emit('info depth 18 multipv 1 score cp 44 pv e7e5 g1f3 b8c6');
    process.emit('info depth 18 multipv 2 score cp 30 pv c7c5 g1f3 d7d6');
    process.emit('bestmove e7e5 ponder g1f3');
    const result = await evalPromise;

    expect(process.written).toContain('setoption name MultiPV value 2\n');
    expect(result).toEqual([
      { scoreCp: 44, mateIn: null, bestUci: 'e7e5' },
      { scoreCp: 30, mateIn: null, bestUci: 'c7c5' },
    ]);
    expect(process.written).toContain('setoption name MultiPV value 1\n');
  });

  it('evaluateMultiPv() reconoce mate en cualquier linea', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const evalPromise = engine.evaluateMultiPv(['e2e4'], 800000, 2);
    process.emit('info depth 10 multipv 1 score mate 2 pv d1h5 g7g6');
    process.emit('info depth 10 multipv 2 score cp -50 pv b8c6');
    process.emit('bestmove d1h5');
    const result = await evalPromise;

    expect(result).toEqual([
      { scoreCp: null, mateIn: 2, bestUci: 'd1h5' },
      { scoreCp: -50, mateIn: null, bestUci: 'b8c6' },
    ]);
  });

  it('evaluateMultiPv() con una sola linea legal devuelve un solo elemento', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    const evalPromise = engine.evaluateMultiPv([], 800000, 2);
    process.emit('info depth 10 multipv 1 score cp 20 pv e2e4');
    process.emit('bestmove e2e4');
    const result = await evalPromise;

    expect(result).toEqual([{ scoreCp: 20, mateIn: null, bestUci: 'e2e4' }]);
  });

  it('quit() manda el comando y mata el proceso', async () => {
    const { engine, process } = startedEngine();
    process.emit('uciok');
    await engine.start();

    engine.quit();

    expect(process.written).toContain('quit\n');
    expect(process.killed).toBe(true);
  });
});
