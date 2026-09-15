import { describe, expect, it } from 'vitest';
import { createWorkerTransport, type WorkerLike } from '@/lib/engine/worker-transport';

/** Un Worker falso. El transporte recibe el worker ya construido justo para poder hacer esto. */
function workerFalso(): WorkerLike & { enviados: string[]; emitir: (data: unknown) => void; muerto: boolean } {
  const estado = {
    enviados: [] as string[],
    muerto: false,
    listeners: [] as ((event: { data: unknown }) => void)[],
    postMessage(data: string) {
      estado.enviados.push(data);
    },
    addEventListener(_type: 'message', listener: (event: { data: unknown }) => void) {
      estado.listeners.push(listener);
    },
    terminate() {
      estado.muerto = true;
    },
    emitir(data: unknown) {
      for (const l of estado.listeners) l({ data });
    },
  };
  return estado;
}

describe('createWorkerTransport', () => {
  it('manda comandos sin agregar salto de linea: el worker recibe mensajes, no un flujo', () => {
    const w = workerFalso();
    createWorkerTransport(w).send('go depth 12');
    expect(w.enviados).toEqual(['go depth 12']);
  });

  it('entrega cada mensaje como una linea', () => {
    const w = workerFalso();
    const recibidas: string[] = [];
    createWorkerTransport(w).onLine((l) => recibidas.push(l));

    w.emitir('uciok');
    w.emitir('info depth 4 score cp 12 pv e2e4');
    expect(recibidas).toEqual(['uciok', 'info depth 4 score cp 12 pv e2e4']);
  });

  it('ignora los mensajes que no son texto en vez de romper el parser', () => {
    // Algunos builds mandan objetos de progreso de carga del wasm.
    const w = workerFalso();
    const recibidas: string[] = [];
    createWorkerTransport(w).onLine((l) => recibidas.push(l));

    w.emitir({ progreso: 0.5 });
    w.emitir(null);
    w.emitir('readyok');
    expect(recibidas).toEqual(['readyok']);
  });

  it('solo se suscribe una vez aunque se llame onLine de nuevo', () => {
    const w = workerFalso();
    const t = createWorkerTransport(w);
    const recibidas: string[] = [];
    t.onLine((l) => recibidas.push(l));
    t.onLine((l) => recibidas.push(`duplicado:${l}`));

    w.emitir('uciok');
    expect(recibidas).toEqual(['uciok']);
  });

  it('dispose mata el worker y es idempotente', () => {
    const w = workerFalso();
    const t = createWorkerTransport(w);
    t.dispose();
    expect(w.muerto).toBe(true);
    // Llamarlo de nuevo no debe tirar: el efecto de React puede limpiar dos veces.
    expect(() => t.dispose()).not.toThrow();
  });

  it('despues de dispose no se manda nada mas a un worker muerto', () => {
    const w = workerFalso();
    const t = createWorkerTransport(w);
    t.dispose();
    t.send('go depth 20');
    expect(w.enviados).toEqual([]);
  });
});
