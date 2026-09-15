import { describe, expect, it } from 'vitest';
import { UciSession, type EvalLine } from '@/lib/engine/session';
import type { UciTransport } from '@/lib/engine/transport';

/**
 * Un transporte falso: guarda lo que se le manda y deja empujar lineas a mano. Es el equivalente
 * del `spawnFn` simulado que ya usa `tests/uci.test.ts`, pero sin proceso ni buffers, porque
 * `UciSession` no sabe de donde vienen las lineas.
 */
function transporteFalso(): UciTransport & { enviados: string[]; emitir: (linea: string) => void } {
  const enviados: string[] = [];
  let listener: ((line: string) => void) | null = null;
  return {
    enviados,
    send: (command) => enviados.push(command),
    onLine: (cb) => {
      listener = cb;
    },
    dispose: () => undefined,
    emitir: (linea) => listener?.(linea),
  };
}

describe('searchStreaming', () => {
  it('agrupa por multipv y reporta las lineas ordenadas, la mejor primero', () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const vistas: EvalLine[][] = [];

    sesion.searchStreaming(['e2e4'], {
      depth: 12,
      multiPv: 3,
      onUpdate: (lineas) => vistas.push([...lineas]),
    });

    // Llegan desordenadas, como las manda el motor de verdad.
    t.emitir('info depth 8 multipv 2 score cp 10 pv d7d5 e4d5');
    t.emitir('info depth 8 multipv 1 score cp 30 pv e7e5 g1f3');
    t.emitir('info depth 8 multipv 3 score cp -5 pv c7c5');

    const ultima = vistas[vistas.length - 1];
    expect(ultima?.map((l) => l.rank)).toEqual([1, 2, 3]);
    expect(ultima?.[0]?.pv).toEqual(['e7e5', 'g1f3']);
    expect(ultima?.[0]?.scoreCp).toBe(30);
  });

  it('manda MultiPV, la posicion y `go depth`, nunca `go infinite`', () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    sesion.searchStreaming(['e2e4', 'e7e5'], { depth: 18, multiPv: 3, onUpdate: () => undefined });

    expect(t.enviados).toEqual([
      'setoption name MultiPV value 3',
      'position startpos moves e2e4 e7e5',
      'go depth 18',
    ]);
    expect(t.enviados.join(' ')).not.toContain('infinite');
  });

  it('sin jugadas manda la posicion inicial pelada', () => {
    const t = transporteFalso();
    new UciSession(t).searchStreaming([], { depth: 10, multiPv: 1, onUpdate: () => undefined });
    expect(t.enviados).toContain('position startpos');
  });

  it('stop() no resuelve hasta que el motor confirma con bestmove', async () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const handle = sesion.searchStreaming([], { depth: 20, multiPv: 1, onUpdate: () => undefined });

    let resuelto = false;
    const espera = handle.stop().then(() => {
      resuelto = true;
    });

    expect(t.enviados).toContain('stop');
    // Todavia no: el motor no contesto. Es el bug que hace que los `info` de la busqueda vieja
    // se mezclen con los de la nueva si uno arranca la siguiente antes de tiempo.
    await Promise.resolve();
    expect(resuelto).toBe(false);

    t.emitir('bestmove e2e4');
    await espera;
    expect(resuelto).toBe(true);
  });

  it('stop() sobre una busqueda ya terminada resuelve de inmediato', async () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const handle = sesion.searchStreaming([], { depth: 4, multiPv: 1, onUpdate: () => undefined });

    t.emitir('bestmove e2e4');
    await expect(handle.stop()).resolves.toBeUndefined();
  });

  it('despues del bestmove las lineas dejan de llegar: no contaminan la siguiente busqueda', () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const vistas: EvalLine[][] = [];
    sesion.searchStreaming([], { depth: 4, multiPv: 1, onUpdate: (l) => vistas.push([...l]) });

    t.emitir('info depth 4 multipv 1 score cp 12 pv e2e4');
    const cuantas = vistas.length;
    t.emitir('bestmove e2e4');
    t.emitir('info depth 9 multipv 1 score cp 900 pv h2h4');

    expect(vistas.length).toBe(cuantas);
  });

  it('un mate se reporta como mate y no como centipeones', () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const vistas: EvalLine[][] = [];
    sesion.searchStreaming([], { depth: 6, multiPv: 1, onUpdate: (l) => vistas.push([...l]) });

    t.emitir('info depth 6 multipv 1 score mate 2 pv d1h5 g7g6');
    expect(vistas[vistas.length - 1]?.[0]).toMatchObject({ mateIn: 2, scoreCp: null });
  });

  it('ignora las lineas sin pv, que no sirven para mostrar una variante', () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const vistas: EvalLine[][] = [];
    sesion.searchStreaming([], { depth: 6, multiPv: 1, onUpdate: (l) => vistas.push([...l]) });

    t.emitir('info depth 1 score cp 20 nodes 20');
    expect(vistas).toHaveLength(0);
  });
});

describe('UciSession sobre un transporte cualquiera', () => {
  it('start() captura el nombre del motor, que es de donde sale engine_id', async () => {
    const t = transporteFalso();
    const sesion = new UciSession(t);
    const arranque = sesion.start();
    t.emitir('id name Stockfish 19');
    t.emitir('uciok');
    await arranque;
    expect(sesion.engineName).toBe('Stockfish 19');
    expect(sesion.buildEngineId({ nodes: 800000, threads: 7 })).toBe('stockfish-19-800k-t7');
  });

  it('quit() cierra el transporte', () => {
    const t = transporteFalso();
    let cerrado = false;
    const sesion = new UciSession({ ...t, dispose: () => (cerrado = true) });
    sesion.quit();
    expect(cerrado).toBe(true);
  });
});
