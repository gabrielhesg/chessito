/**
 * `pnpm analyze` — el analizador con Stockfish nativo. Lo corre GitHub Actions
 * (.github/workflows/analyze.yml) y tambien sirve en local con un `.env.local` completo.
 *
 * `STOCKFISH_PATH`, `ENGINE_NODES` y `ENGINE_THREADS` NO viven en lib/env.ts a proposito:
 * son configuracion de este script y de ningun otro, igual que `GITHUB_ACTIONS` en
 * scripts/lib/context.ts. Meterlos en el esquema Zod compartido obligaria a toda la app a
 * declararlos.
 *
 * Uso:
 *   pnpm analyze              lote de 200 partidas (default)
 *   pnpm analyze --batch 50   lote mas chico, util para medir tiempo real antes de un backfill
 */
import { config } from 'dotenv';
import { assertEnv, appEnv } from '@/lib/env';
import { UciEngine } from '@/lib/engine/uci';
import { AnalysisStore } from '@/lib/analysis/store';
import { runAnalyze } from '@/lib/analysis/run';
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
    throw new Error('Falta SUPABASE_DB_URL: el analizador necesita conexion directa a Postgres.');
  }

  const stockfishPath = process.env['STOCKFISH_PATH'] ?? '/usr/games/stockfish';
  const nodes = Number.parseInt(process.env['ENGINE_NODES'] ?? '800000', 10);
  const threads = Number.parseInt(process.env['ENGINE_THREADS'] ?? '1', 10);
  const batchSize = Number.parseInt(arg('--batch', '200'), 10);
  const trigger = process.env['GITHUB_ACTIONS'] === 'true' ? 'workflow_dispatch' : 'manual';

  const engine = new UciEngine(stockfishPath);
  await engine.start();
  await engine.configure({ threads, hashMb: 256 });
  const engineId = engine.buildEngineId({ nodes, threads });

  const store = new AnalysisStore(env.SUPABASE_DB_URL);

  try {
    const summary = await runAnalyze({
      store,
      engine,
      engineId,
      nodes,
      batchSize,
      environment: appEnv(),
      trigger,
    });

    console.log(
      JSON.stringify({
        job_run_id: summary.jobRunId,
        status: summary.status,
        engine_id: engineId,
        procesadas: summary.processed,
        fallidas: summary.failed,
        duracion_ms: summary.durationMs,
        pendientes: summary.remaining,
        correlacion_acpl_accuracy: summary.correlation,
      }),
    );

    if (summary.status === 'failed') process.exitCode = 1;
  } finally {
    engine.quit();
    await store.close();
  }
}

main().catch(die);
