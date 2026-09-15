/**
 * El transporte por donde viajan las lineas UCI. Solo tipos: cero imports, para que lo pueda
 * importar tanto el codigo de Node como el del navegador.
 *
 * Dos implementaciones, misma logica encima (`session.ts`), igual que `lib/ingest/store.ts`:
 *   - `node-transport.ts`  — un binario de Stockfish como proceso hijo. GitHub Actions y scripts.
 *   - `worker-transport.ts` — Stockfish WASM en un Web Worker. El navegador.
 */
export type UciTransport = {
  /** Manda un comando. La implementacion agrega el salto de linea si su canal lo necesita. */
  send(command: string): void;
  /** Registra el consumidor de lineas. Se llama una sola vez, al construir la sesion. */
  onLine(listener: (line: string) => void): void;
  /** Cierra el canal. Idempotente: llamarlo dos veces no debe tirar. */
  dispose(): void;
};
