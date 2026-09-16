/**
 * `pnpm moves:rephase` — re-deriva `moves.phase` para el historico completo desde `games.pgn`.
 *
 * Idempotente: correrlo dos veces seguidas la segunda vez reporta `cambiadas: 0`.
 * Reanudable: `--desde <id>` retoma una corrida cortada sin repetir trabajo.
 *
 * Solo toca la columna `phase`. Las evaluaciones del motor no se tocan.
 */
import { runRephaseMoves } from '@/lib/ingest/rephase-moves';
import { batchContext, die } from './lib/context';

function leerDesde(argv: string[]): number {
  const i = argv.indexOf('--desde');
  if (i === -1) return 0;
  const valor = Number.parseInt(argv[i + 1] ?? '', 10);
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error('--desde necesita un id de partida entero y no negativo');
  }
  return valor;
}

async function main(): Promise<void> {
  const { store, environment, trigger } = batchContext();
  const desdeId = leerDesde(process.argv.slice(2));

  try {
    const summary = await runRephaseMoves({ store, environment, trigger, desdeId });

    console.log(
      JSON.stringify({
        job_run_id: summary.jobRunId,
        status: summary.status,
        partidas: summary.processed,
        jugadas_cambiadas: summary.cambiadas,
        fallidas: summary.failed,
        ultimo_id: summary.ultimoId,
        duracion_ms: summary.durationMs,
        fallas: summary.failures.slice(0, 20),
      }),
    );

    if (summary.status === 'failed') process.exitCode = 1;
  } finally {
    await store.close();
  }
}

main().catch(die);
