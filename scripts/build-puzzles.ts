/**
 * `pnpm puzzles:build` — genera ejercicios desde los blunders reales de Gabriel. Mismo
 * esqueleto que `scripts/analyze.ts`: lee las mismas `STOCKFISH_PATH`/`ENGINE_NODES`/
 * `ENGINE_THREADS` de `process.env` (no viven en `lib/env.ts`, son de este script), y usa
 * `UciEngine.evaluateMultiPv` en vez de `evaluate` para el filtro de calidad MultiPV.
 *
 * Uso:
 *   pnpm puzzles:build              lote de 200 candidatos (default)
 *   pnpm puzzles:build --batch 50   lote mas chico
 */
import { config } from 'dotenv';
import { assertEnv, appEnv } from '@/lib/env';
import { UciEngine } from '@/lib/engine/uci';
import { PuzzleStore } from '@/lib/puzzles/store';
import { runBuildPuzzles } from '@/lib/puzzles/run';
import { die } from './lib/context';

config({ path: '.env.local', quiet: true });

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value ?? fallback;
}

async function main(): Promise<void> {
  const env = assertEnv();
  if (!env.SUPABASE_DB_URL) {
    throw new Error('Falta SUPABASE_DB_URL: build-puzzles necesita conexion directa a Postgres.');
  }

  const stockfishPath = process.env['STOCKFISH_PATH'] ?? '/usr/games/stockfish';
  const nodes = Number.parseInt(process.env['ENGINE_NODES'] ?? '800000', 10);
  const threads = Number.parseInt(process.env['ENGINE_THREADS'] ?? '1', 10);
  const batchSize = Number.parseInt(arg('--batch', '200'), 10);
  const trigger = process.env['GITHUB_ACTIONS'] === 'true' ? 'workflow_dispatch' : 'manual';

  const engine = new UciEngine(stockfishPath);
  await engine.start();
  await engine.configure({ threads, hashMb: 256 });

  const store = new PuzzleStore(env.SUPABASE_DB_URL);

  try {
    const summary = await runBuildPuzzles({
      store,
      engine,
      nodes,
      batchSize,
      environment: appEnv(),
      trigger,
    });

    console.log(
      JSON.stringify({
        job_run_id: summary.jobRunId,
        status: summary.status,
        procesados: summary.processed,
        fallidos: summary.failed,
        duracion_ms: summary.durationMs,
      }),
    );

    if (summary.status === 'failed') process.exitCode = 1;
  } finally {
    engine.quit();
    await store.close();
  }
}

main().catch(die);
