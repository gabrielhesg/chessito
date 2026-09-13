/**
 * `pnpm moves:extract` — puebla `moves` desde el PGN de cada partida sin filas todavia.
 *
 * Idempotente: correrlo dos veces seguidas la segunda vez no encuentra partidas pendientes.
 */
import { runExtractMoves } from '@/lib/ingest/extract-moves';
import { batchContext, die } from './lib/context';

async function main(): Promise<void> {
  const { store, environment, trigger } = batchContext();

  try {
    const summary = await runExtractMoves({ store, environment, trigger });

    console.log(
      JSON.stringify({
        job_run_id: summary.jobRunId,
        status: summary.status,
        procesadas: summary.processed,
        fallidas: summary.failed,
        duracion_ms: summary.durationMs,
        fallas: summary.failures,
      }),
    );

    if (summary.status === 'failed') process.exitCode = 1;
  } finally {
    await store.close();
  }
}

main().catch(die);
