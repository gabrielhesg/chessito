/**
 * `runBuildPuzzles`: la UNICA funcion de construccion de ejercicios. Mismo patron que
 * `runAnalyze`/`runIngest`: reclama candidatos en lotes, tolera fallas parciales (un candidato
 * que falla se loguea y la corrida sigue, sin marcar nada mas: a diferencia de `runAnalyze`
 * aca no hay un estado de partida que actualizar), y abre/cierra una fila en `job_runs`.
 */
import { Chess, type Square } from 'chess.js';
import { inferTheme } from '@/lib/chess/theme';
import { log } from '@/lib/log';
import { winPct } from '@/lib/analysis/winpct';
import type { PuzzleStore } from './store';

type LineaMotor = {
  scoreCp: number | null;
  mateIn: number | null;
  bestUci: string | null;
  /** Linea principal completa. `evaluateMultiPv` la devuelve desde la Fase 6C. */
  pv?: readonly string[];
};

export type MultiPvEngine = {
  evaluateMultiPv(uciMoves: readonly string[], nodes: number, lines: number): Promise<LineaMotor[]>;
  /**
   * Una sola linea. Se usa para la posicion DESPUES del blunder: su PV es la refutacion, o sea
   * como el rival te castigaba, que es el insumo de la explicacion del entrenador.
   */
  evaluate(uciMoves: readonly string[], nodes: number): Promise<LineaMotor>;
};

export type BuildPuzzlesOptions = {
  store: PuzzleStore;
  engine: MultiPvEngine;
  nodes: number;
  batchSize: number;
  environment: string;
  trigger: string;
  /**
   * 'construir' busca blunders sin ejercicio; 'enriquecer' rellena las lineas de los ejercicios
   * que ya existen desde antes de la migracion 0007. El resto del camino es identico.
   */
  modo?: 'construir' | 'enriquecer';
};

export type BuildFailure = { gameId: number; ply: number; reason: string };

export type BuildSummary = {
  jobRunId: number;
  status: 'success' | 'failed';
  processed: number;
  failed: number;
  durationMs: number;
  failures: BuildFailure[];
};

const UNIQUE_WIN_PCT_GAP = 10;

function fenBeforeBlunder(uciPrefix: readonly string[]): string {
  const chess = new Chess();
  for (const uci of uciPrefix) {
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length > 4 ? uci.slice(4) : undefined;
    chess.move({ from, to, promotion });
  }
  return chess.fen();
}

function mateAsCp(mateIn: number | null, scoreCp: number | null): number {
  if (mateIn !== null) return mateIn > 0 ? 10000 : -10000;
  return scoreCp ?? 0;
}

export async function runBuildPuzzles(options: BuildPuzzlesOptions): Promise<BuildSummary> {
  const { store, engine, nodes, environment, trigger } = options;
  const startedAt = Date.now();
  const jobRunId = await store.startJobRun({ kind: 'puzzles', environment, trigger });

  let processed = 0;
  const failures: BuildFailure[] = [];

  try {
    const modo = options.modo ?? 'construir';
    let remaining = options.batchSize;
    for (;;) {
      const lotSize = Math.min(10, Math.max(1, remaining));
      const candidates =
        modo === 'enriquecer'
          ? await store.claimIncompletePuzzles(lotSize)
          : await store.claimBlunderCandidates(lotSize);
      if (candidates.length === 0) break;

      for (const candidate of candidates) {
        try {
          const uciPrefix = await store.loadUciPrefix(candidate.gameId, candidate.ply);
          const fen = fenBeforeBlunder(uciPrefix);
          const lines = await engine.evaluateMultiPv(uciPrefix, nodes, 2);
          const best = lines[0];
          if (!best) throw new Error('El motor no devolvio ninguna linea legal en la posicion candidata');
          // La posicion candidata es ANTES del blunder de Gabriel: siempre tenia una jugada legal
          // (la que jugo, aunque mala), asi que "(none)" aca es un candidato corrupto, no un caso valido.
          if (best.bestUci === null) throw new Error('El motor devolvio "(none)" en una posicion con jugadas legales');

          const second = lines[1];
          const isUnique =
            second === undefined ||
            Math.abs(
              winPct(mateAsCp(best.mateIn, best.scoreCp)) - winPct(mateAsCp(second.mateIn, second.scoreCp)),
            ) >= UNIQUE_WIN_PCT_GAP;

          const theme = inferTheme({ fenBefore: fen, playedUci: candidate.playedUci, mateIn: best.mateIn });

          // La segunda llamada al motor, y la razon de ser de toda esta fase: el PV de la
          // posicion DESPUES del blunder es como el rival te castigaba. Sin esto el entrenador
          // solo puede decir "era otra jugada" y no por que.
          const refutacion = await engine.evaluate([...uciPrefix, candidate.playedUci], nodes);

          await store.insertPuzzle({
            gameId: candidate.gameId,
            ply: candidate.ply,
            fen,
            playedUci: candidate.playedUci,
            bestUci: best.bestUci,
            cpLoss: candidate.cpLoss,
            winPctLoss: candidate.winPctLoss,
            isUnique,
            theme,
            myColor: candidate.myColor,
            solutionLine: [...(best.pv ?? [best.bestUci])],
            refutationLine: [...(refutacion.pv ?? [])],
            evalBestCp: best.scoreCp,
            evalPlayedCp: refutacion.scoreCp,
            secondBestUci: second?.bestUci ?? null,
            secondBestCp: second?.scoreCp ?? null,
          });
          processed += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push({ gameId: candidate.gameId, ply: candidate.ply, reason });
          log.warn('Candidato de ejercicio descartado: fallo la construccion', {
            gameId: candidate.gameId,
            ply: candidate.ply,
            reason,
          });
        }
      }

      remaining -= candidates.length;
      if (remaining <= 0) break;
    }

    const durationMs = Date.now() - startedAt;
    const status: BuildSummary['status'] = 'success';
    const summary: BuildSummary = { jobRunId, status, processed, failed: failures.length, durationMs, failures };

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
      log.error('No se pudo cerrar la corrida de puzzles en job_runs', {
        jobRunId,
        motivo: cierreFallido instanceof Error ? cierreFallido.message : String(cierreFallido),
      });
    }
    throw error;
  }
}
