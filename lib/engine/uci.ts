/**
 * Cliente UCI contra un binario de Stockfish nativo, por stdin/stdout. Es lo que usan el
 * analizador de GitHub Actions y los scripts (docs/ANALYSIS-SPEC.md).
 *
 * Desde la Fase 8 esto es una FACHADA: la logica UCI vive en `session.ts` y el proceso hijo en
 * `node-transport.ts`, porque el mismo protocolo tiene que servir tambien a un Stockfish WASM
 * en el navegador. La API publica de este archivo no cambio, asi que `scripts/analyze.ts`,
 * `scripts/build-puzzles.ts`, `lib/analysis/run.ts` y `tests/uci.test.ts` siguen igual.
 *
 * IMPORTANTE: este modulo arrastra `node:child_process`. NUNCA importarlo desde `components/`
 * ni desde el hook del navegador — para eso estan `session.ts` y `worker-transport.ts`.
 */
import { createNodeTransport, defaultSpawn, type SpawnFn } from '@/lib/engine/node-transport';
import { UciSession } from '@/lib/engine/session';

export type { EngineProcess, SpawnFn } from '@/lib/engine/node-transport';
export type { EvalResult, EvalLine, SearchHandle } from '@/lib/engine/session';

export class UciEngine extends UciSession {
  constructor(enginePath: string, spawnFn: SpawnFn = defaultSpawn) {
    super(createNodeTransport(enginePath, spawnFn));
  }
}
