import { buildMoveRows } from '@/lib/chess/moves';
import { log } from '@/lib/log';
import type { IngestStore } from './store';

/**
 * `pnpm moves:rephase`. Re-deriva `moves.phase` para el historico completo, desde el PGN que
 * ya esta guardado en `games.pgn`.
 *
 * Existe porque `lib/chess/phase.ts` cambio de criterio en la revision integral: el viejo
 * declaraba "final" apenas se cambiaba una pieza por bando, y dejaba el 62% de las jugadas del
 * historico en esa fase. Las filas de `moves` ya estan escritas, asi que no hay nada que
 * extraer: hay que recalcular una columna derivada.
 *
 * Tres propiedades que importan:
 *
 * - **No toca ninguna otra columna.** `eval_cp`, `classification`, `cp_loss` y compania
 *   cuestan horas de Stockfish en Actions y no se pueden reconstruir desde el PGN.
 * - **Es idempotente y la idempotencia es medible:** `updateMovePhases` solo cuenta las filas
 *   que CAMBIARON de valor, asi que una segunda corrida seguida reporta `cambiadas: 0`.
 * - **Es reanudable.** Avanza por `id` de partida en paginas, asi que una corrida cortada se
 *   retoma con `--desde <id>` sin repetir trabajo.
 *
 * Una partida cuyo PGN no se puede reproducir no detiene la corrida: se cuenta como fallida y
 * se sigue. A diferencia de `moves:extract`, NO se marca `analysis_state = 'failed'`, porque
 * aca la partida ya tiene sus jugadas: lo unico que falla es el recalculo de una columna.
 */
export type RephaseMovesOptions = {
  store: IngestStore;
  environment: string;
  trigger: string;
  /** Reanudar desde este id de partida (exclusivo). 0 para empezar del principio. */
  desdeId?: number;
  /** Cuantas partidas leer por pagina. */
  pageSize?: number;
};

export type RephaseMovesSummary = {
  jobRunId: number;
  status: 'success' | 'failed';
  /** Partidas recorridas. */
  processed: number;
  /** Filas de `moves` cuyo `phase` cambio de valor. */
  cambiadas: number;
  failed: number;
  failures: { gameId: number; reason: string }[];
  ultimoId: number;
  durationMs: number;
};

const PAGE_SIZE = 500;

export async function runRephaseMoves(options: RephaseMovesOptions): Promise<RephaseMovesSummary> {
  const { store, environment, trigger } = options;
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const startedAt = Date.now();
  const jobRunId = await store.startJobRun({ kind: 'extract_moves', environment, trigger });

  let processed = 0;
  let cambiadas = 0;
  let ultimoId = options.desdeId ?? 0;
  const failures: { gameId: number; reason: string }[] = [];

  try {
    for (;;) {
      const games = await store.loadGamesForRephase(ultimoId, pageSize);
      if (games.length === 0) break;

      for (const game of games) {
        ultimoId = game.id;
        try {
          const rows = buildMoveRows({
            pgn: game.pgn,
            myColor: game.myColor,
            baseSeconds: game.baseSeconds,
            incrementSecs: game.incrementSecs,
            openingPlyCount: game.openingPlyCount,
          });
          cambiadas += await store.updateMovePhases(
            game.id,
            rows.map((row) => ({ ply: row.ply, phase: row.phase })),
          );
          processed += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push({ gameId: game.id, reason });
          log.warn('No se pudo re-derivar la fase de una partida', { gameId: game.id, reason });
        }
      }

      log.info('Refase en progreso', { processed, cambiadas, ultimoId });
      if (games.length < pageSize) break;
    }

    const durationMs = Date.now() - startedAt;
    await store.finishJobRun(jobRunId, {
      status: 'success',
      processed,
      failed: failures.length,
      skipped: 0,
      remaining: null,
      error: null,
      detail: { operacion: 'rephase', cambiadas, ultimoId, fallidas: failures.slice(0, 50) },
    });

    return {
      jobRunId,
      status: 'success',
      processed,
      cambiadas,
      failed: failures.length,
      failures,
      ultimoId,
      durationMs,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await store.finishJobRun(jobRunId, {
        status: 'failed',
        processed,
        failed: failures.length,
        skipped: 0,
        remaining: null,
        error: reason,
        detail: { operacion: 'rephase', cambiadas, ultimoId, fallidas: failures.slice(0, 50) },
      });
    } catch (cierreFallido) {
      log.error('No se pudo cerrar la corrida de rephase en job_runs', {
        jobRunId,
        motivo: cierreFallido instanceof Error ? cierreFallido.message : String(cierreFallido),
      });
    }
    throw error;
  }
}
