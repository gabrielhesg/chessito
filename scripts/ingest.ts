/**
 * `pnpm ingest` — el mismo `runIngest` que llaman el cron de Vercel, el workflow de GitHub
 * Actions y el boton "Actualizar ahora" de la app.
 *
 * Uso:
 *   pnpm ingest              mes actual y anterior (el refresco normal)
 *   pnpm ingest --full       todo el historico
 */
import { ChesscomClient } from '@/lib/chess/chesscom';
import { runIngest, type IngestScope } from '@/lib/ingest/run';
import { batchContext, die } from './lib/context';

async function main(): Promise<void> {
  const { store, username, environment, trigger } = batchContext();
  const scope: IngestScope = process.argv.includes('--full') ? { kind: 'full' } : { kind: 'recent' };

  try {
    const summary = await runIngest({
      store,
      client: new ChesscomClient({ username }),
      username,
      environment,
      trigger,
      scope,
    });

    console.log(
      JSON.stringify({
        job_run_id: summary.jobRunId,
        status: summary.status,
        meses: summary.months,
        procesadas: summary.processed,
        fallidas: summary.failed,
        saltadas: summary.skipped,
        pendientes_de_analizar: summary.remaining,
        duracion_ms: summary.durationMs,
        reconciliacion_ok: summary.reconciliationOk,
        reconciliacion: summary.reconciliation.filter((r) => r.missing > 0),
      }),
    );

    if (summary.status === 'failed') process.exitCode = 1;
  } finally {
    await store.close();
  }
}

main().catch(die);
