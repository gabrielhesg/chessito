/**
 * El transporte del navegador: Stockfish WASM dentro de un Web Worker.
 *
 * A diferencia del transporte de Node, acá NO hace falta `splitLines`: el script de Stockfish
 * emite una linea completa por cada `postMessage`, no chunks cortados a medias.
 *
 * Recibe un `Worker` ya construido en vez de una URL, por dos razones: quien llama puede
 * envolver el `new Worker(...)` en su propio try/catch (que es como se degrada cuando el
 * navegador no lo soporta), y los tests pueden pasar un worker falso. Es el mismo patron de
 * inyeccion que `SpawnFn` en el transporte de Node.
 */
import type { UciTransport } from '@/lib/engine/transport';

/** Lo minimo que este transporte necesita de un Worker. Permite un doble en los tests. */
export type WorkerLike = {
  postMessage(data: string): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  terminate(): void;
};

export function createWorkerTransport(worker: WorkerLike): UciTransport {
  let escuchando = false;
  let cerrado = false;

  return {
    send(command) {
      if (cerrado) return;
      worker.postMessage(command);
    },
    onLine(listener) {
      if (escuchando) return;
      escuchando = true;
      worker.addEventListener('message', (event) => {
        // El motor manda strings; cualquier otra cosa (objetos de progreso de algunos builds)
        // no es una linea UCI y se ignora en vez de romper el parser.
        if (typeof event.data === 'string') listener(event.data);
      });
    },
    dispose() {
      if (cerrado) return;
      cerrado = true;
      worker.terminate();
    },
  };
}
