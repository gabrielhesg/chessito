import { buildMoveRows } from '@/lib/chess/moves';
import { log } from '@/lib/log';
import type { IngestStore } from './store';

/**
 * `pnpm moves:extract`. La unica funcion de extraccion de jugadas, igual que `runIngest` es
 * la unica de ingesta: puebla `moves` a partir del PGN ya guardado en `games.pgn`.
 *
 * Idempotente por construccion: `store.loadGamesForMoves()` solo devuelve partidas SIN filas
 * en `moves`, asi que correrla dos veces seguidas la segunda vez no encuentra nada que hacer.
 * Una partida cuyo PGN no se puede reproducir (trampa 4 de CLAUDE.md: el try/catch va
 * alrededor del bucle de `chess.move()`, no de `loadPgn`) se marca `analysis_state = 'failed'`
 * y la corrida sigue con las demas.
 */
export type ExtractMovesOptions = {
  store: IngestStore;
  environment: string;
  trigger: string;
};

export type ExtractMovesFailure = { gameId: number; reason: string };

export type ExtractMovesSummary = {
  jobRunId: number;
  status: 'success' | 'failed';
  processed: number;
  failed: number;
  failures: ExtractMovesFailure[];
  durationMs: number;
};

export async function runExtractMoves(options: ExtractMovesOptions): Promise<ExtractMovesSummary> {
  const { store, environment, trigger } = options;
  const startedAt = Date.now();
  const jobRunId = await store.startJobRun({ kind: 'extract_moves', environment, trigger });

  let processed = 0;
  const failures: ExtractMovesFailure[] = [];

  try {
    const games = await store.loadGamesForMoves();
    log.info('Partidas pendientes de extraer jugadas', { total: games.length });

    for (const game of games) {
      try {
        const rows = buildMoveRows({
          pgn: game.pgn,
          myColor: game.myColor,
          baseSeconds: game.baseSeconds,
          incrementSecs: game.incrementSecs,
          openingPlyCount: game.openingPlyCount,
        });
        if (rows.length === 0) {
          // ply_count 0: el rival abandono antes de mover. No hay nada que insertar, y sin
          // marcarla `v_games_pending_moves` la volveria a ofrecer en cada corrida.
          await store.markMovesEmpty(game.id);
        } else {
          await store.insertMoves(game.id, rows);
        }
        processed += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push({ gameId: game.id, reason });
        // Resistencia a fallas parciales, igual que la ingesta: se marca y la corrida sigue.
        await store.markMovesFailed(game.id);
        log.warn('Partida marcada failed: no se pudo extraer sus jugadas', { gameId: game.id, reason });
      }
    }

    const durationMs = Date.now() - startedAt;
    const status: ExtractMovesSummary['status'] = 'success';
    const summary: ExtractMovesSummary = { jobRunId, status, processed, failed: failures.length, failures, durationMs };

    await store.finishJobRun(jobRunId, {
      status,
      processed,
      failed: failures.length,
      skipped: 0,
      remaining: null,
      error: null,
      detail: { fallidas: failures.slice(0, 50) },
    });

    return summary;
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
        detail: { fallidas: failures.slice(0, 50) },
      });
    } catch (cierreFallido) {
      log.error('No se pudo cerrar la corrida de extract_moves en job_runs', {
        jobRunId,
        motivo: cierreFallido instanceof Error ? cierreFallido.message : String(cierreFallido),
      });
    }
    throw error;
  }
}
