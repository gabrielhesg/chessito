import { monthKey, type ArchiveMonth, type ChesscomClient, type ChesscomGame } from '@/lib/chess/chesscom';
import { mapGame, type GameRow } from '@/lib/chess/game';
import { log } from '@/lib/log';
import type { IngestStore } from './store';

/**
 * La UNICA funcion de ingesta del proyecto. La llaman los cuatro disparadores:
 * el workflow de GitHub Actions (cada 3 horas), el cron de Vercel (diario), el boton
 * "Actualizar ahora" de la app, y `pnpm ingest`. No hay dos implementaciones que diverjan.
 */

export type IngestScope =
  /** Todo el historico. La primera carga. */
  | { kind: 'full' }
  /** Mes actual y anterior: el refresco normal (docs/DATA-SOURCES.md). */
  | { kind: 'recent' }
  /** Meses puntuales, para depurar. */
  | { kind: 'months'; months: ArchiveMonth[] };

export type IngestOptions = {
  store: IngestStore;
  client: ChesscomClient;
  username: string;
  environment: string;
  trigger: string;
  scope?: IngestScope;
  /** Para tests: reloj inyectable. */
  now?: Date;
};

export type MonthReconciliation = {
  /** Archivo mensual de chess.com, no mes calendario de `end_time`. Ver migracion 0003. */
  month: string;
  /** Partidas de ajedrez con PGN que chess.com reporta en ese archivo. */
  remote: number;
  /** De esas, cuantas quedaron guardadas. */
  stored: number;
  missing: number;
  /** Los uuid que faltan, hasta 20, para poder ir a buscarlos. */
  missingUuids: string[];
};

export type IngestFailure = { uuid: string; url: string; reason: string };

export type IngestSummary = {
  jobRunId: number;
  status: 'success' | 'failed';
  months: string[];
  processed: number;
  failed: number;
  skipped: number;
  remaining: number;
  durationMs: number;
  reconciliation: MonthReconciliation[];
  reconciliationOk: boolean;
  failures: IngestFailure[];
  /** Partidas que la API entrega sin PGN: no se pueden guardar ni contar. */
  withoutPgn: number;
  /** Partidas de variantes (rules != 'chess'): quedan fuera de la reconciliacion. */
  variants: number;
};

const UPSERT_BATCH = 200;

function monthsToSync(archives: ArchiveMonth[], scope: IngestScope, now: Date): ArchiveMonth[] {
  if (scope.kind === 'months') return scope.months;
  if (scope.kind === 'full') return archives;

  // 'recent': el mes actual y el anterior. El anterior por si una partida quedo registrada
  // cruzando la medianoche de fin de mes.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const wanted = [previous, { year, month }];
  const available = new Set(archives.map(monthKey));
  return wanted.filter((m) => available.has(monthKey(m)));
}

export async function runIngest(options: IngestOptions): Promise<IngestSummary> {
  const { store, client, username, environment, trigger } = options;
  const scope = options.scope ?? { kind: 'recent' };
  const now = options.now ?? new Date();
  const startedAt = Date.now();

  const jobRunId = await store.startJobRun({ kind: 'ingest', environment, trigger });

  let processed = 0;
  let failedCount = 0;
  let skipped = 0;
  let withoutPgn = 0;
  let variants = 0;
  const failures: IngestFailure[] = [];
  const remoteUuidsByMonth = new Map<string, string[]>();
  let months: ArchiveMonth[] = [];

  try {
    const openingIndex = await store.loadOpeningIndex();
    if (openingIndex.size === 0) {
      log.warn('La tabla openings esta vacia: las partidas van a quedar sin apertura resuelta', {
        remedio: 'pnpm openings:load',
      });
    }

    const archives = await client.listArchives();
    months = monthsToSync(archives, scope, now);

    for (const month of months) {
      const key = monthKey(month);
      // Serial a proposito: la API de chess.com no limita el acceso serial y si el paralelo.
      const games = await client.listMonth(month);
      const rows: GameRow[] = [];
      const remoteUuids: string[] = [];

      for (const game of games) {
        const counted = countRemote(game);
        if (counted === 'variant') variants += 1;
        if (counted === 'sin-pgn') withoutPgn += 1;
        if (counted === 'ok') remoteUuids.push(game.uuid);

        try {
          const row = mapGame(game, { username, openingsByEpd: openingIndex });
          rows.push(row);
          if (row.analysis_state === 'skipped') skipped += 1;
        } catch (error) {
          failedCount += 1;
          const reason = error instanceof Error ? error.message : String(error);
          failures.push({ uuid: game.uuid, url: game.url, reason });
          // Resistencia a fallas parciales: se registra y la corrida sigue.
          log.warn('Partida omitida', { uuid: game.uuid, url: game.url, reason });
        }
      }

      remoteUuidsByMonth.set(key, remoteUuids);

      for (let from = 0; from < rows.length; from += UPSERT_BATCH) {
        await store.upsertGames(rows.slice(from, from + UPSERT_BATCH));
      }
      processed += rows.length;
      log.info('Mes sincronizado', { month: key, partidas: rows.length });
    }

    await store.recomputeSessionFeatures();

    // Reconciliacion (docs/CONFIANZA.md capa 4). Se compara UUID a UUID y no por conteo
    // mensual: los archivos de chess.com estan cortados por el INICIO de la partida y
    // `games.end_time` es el final, asi que ninguna vista agrupada por mes calza en las
    // fronteras (se verifico contra el historico completo; ver migracion 0003). Ademas, asi
    // la corrida no solo sabe que falta una partida, sabe CUAL.
    const reconciliation: MonthReconciliation[] = [];
    for (const [month, uuids] of [...remoteUuidsByMonth.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const stored = await store.findExistingUuids(uuids);
      const missing = uuids.filter((uuid) => !stored.has(uuid));
      reconciliation.push({
        month,
        remote: uuids.length,
        stored: uuids.length - missing.length,
        missing: missing.length,
        missingUuids: missing.slice(0, 20),
      });
    }
    const reconciliationOk = reconciliation.every((r) => r.missing === 0);

    const remaining = await store.countPendingAnalysis();
    const durationMs = Date.now() - startedAt;
    const status: 'success' | 'failed' = reconciliationOk ? 'success' : 'failed';

    const summary: IngestSummary = {
      jobRunId,
      status,
      months: months.map(monthKey),
      processed,
      failed: failedCount,
      skipped,
      remaining,
      durationMs,
      reconciliation,
      reconciliationOk,
      failures,
      withoutPgn,
      variants,
    };

    await store.finishJobRun(jobRunId, {
      status,
      processed,
      failed: failedCount,
      skipped,
      remaining,
      error: reconciliationOk
        ? null
        : `Faltan ${reconciliation.reduce((total, r) => total + r.missing, 0)} partidas que chess.com si reporta`,
      detail: {
        scope: scope.kind,
        months: summary.months,
        reconciliation: reconciliation.map(({ month, remote, stored, missing, missingUuids }) => ({
          month,
          remote,
          stored,
          missing,
          ...(missing > 0 ? { missing_uuids: missingUuids } : {}),
        })),
        reconciliation_ok: reconciliationOk,
        sin_pgn: withoutPgn,
        variantes: variants,
        fallidas: failures.slice(0, 50),
      },
    });

    return summary;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await store.finishJobRun(jobRunId, {
        status: 'failed',
        processed,
        failed: failedCount,
        skipped,
        remaining: null,
        error: reason,
        detail: { scope: scope.kind, months: months.map(monthKey), fallidas: failures.slice(0, 50) },
      });
    } catch (cierreFallido) {
      // Si tambien falla el cierre, la fila queda en 'running' y la va a delatar `stuck_runs`
      // en /salud. Lo que no puede pasar es que este error tape el original, que es el que
      // explica por que se cayo la corrida.
      log.error('No se pudo cerrar la corrida en job_runs', {
        jobRunId,
        motivo: cierreFallido instanceof Error ? cierreFallido.message : String(cierreFallido),
      });
    }
    throw error;
  }
}

/**
 * Como cuenta la reconciliacion cada partida del lado remoto. Solo `ok` entra en la
 * comparacion: las variantes no se guardan y una partida sin PGN no se puede guardar.
 */
function countRemote(game: ChesscomGame): 'ok' | 'variant' | 'sin-pgn' {
  if (game.rules !== 'chess') return 'variant';
  if (!game.pgn || game.pgn.trim() === '') return 'sin-pgn';
  return 'ok';
}
