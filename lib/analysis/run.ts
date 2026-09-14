/**
 * `runAnalyze`: la UNICA funcion de analisis del proyecto. Mismo patron que `runIngest` y
 * `runExtractMoves`: reclama lotes, procesa cada partida con tolerancia a fallas parciales
 * (una partida que falla se marca `failed` y la corrida sigue), y abre/cierra una fila en
 * `job_runs`.
 *
 * `engine` es una interfaz minima, no la clase `UciEngine`: en produccion la implementa
 * `UciEngine.evaluate`, en el test de integracion un motor falso deterministico. Asi se puede
 * probar el flujo completo de los dos pasos de signo contra Postgres real sin necesitar el
 * binario de Stockfish en CI.
 */
import type { GameColor } from '@/lib/chess/game';
import { log } from '@/lib/log';
import { classify, isDecided } from './classify';
import { computeDivergencePly, type DivergenceEntry } from './divergence';
import { mateToCp } from './mate';
import { computeMoveLoss, toWhitePerspective } from './signs';
import type {
  AnalysisStore,
  ClaimedGame,
  GameAnalysisSummary,
  MoveAnalysisUpdate,
  MoveForAnalysis,
} from './store';
import { winPct } from './winpct';

export type AnalysisEngine = {
  evaluate(uciMoves: readonly string[], nodes: number): Promise<{
    scoreCp: number | null;
    mateIn: number | null;
    /** null cuando la posicion no tiene jugadas legales (jaque mate o ahogado). */
    bestUci: string | null;
  }>;
};

export type AnalyzeOptions = {
  store: AnalysisStore;
  engine: AnalysisEngine;
  /** Se calcula una sola vez por corrida, leyendo `id name` del motor (lib/engine/uci.ts). */
  engineId: string;
  /** Presupuesto fijo de nodos por posicion (docs/ANALYSIS-SPEC.md). */
  nodes: number;
  batchSize: number;
  environment: string;
  trigger: string;
};

export type AnalyzeFailure = { gameId: number; reason: string };

export type AnalyzeSummary = {
  jobRunId: number;
  status: 'success' | 'failed';
  processed: number;
  failed: number;
  remaining: number;
  durationMs: number;
  correlation: { pearson: number | null; n: number };
  failures: AnalyzeFailure[];
};

function sideToMoveAfterPlies(pliesPlayed: number): GameColor {
  return pliesPlayed % 2 === 0 ? 'white' : 'black';
}

function sideThatMoved(ply: number): GameColor {
  // ply 1-based: impar = blancas, par = negras (mismo criterio que lib/chess/moves.ts).
  return ply % 2 === 1 ? 'white' : 'black';
}

/** El eval crudo del motor (cp o mate), en perspectiva del que mueve, para una posicion dada. */
async function evaluatePosition(
  engine: AnalysisEngine,
  uciMoves: readonly string[],
  nodes: number,
): Promise<{ evalWhiteCp: number; mateInWhite: number | null; bestUci: string | null }> {
  const result = await engine.evaluate(uciMoves, nodes);
  const sideToMove = sideToMoveAfterPlies(uciMoves.length);
  const rawCp = result.mateIn !== null ? mateToCp(result.mateIn) : (result.scoreCp ?? 0);
  const evalWhiteCp = toWhitePerspective(rawCp, sideToMove);
  const mateInWhite = result.mateIn === null ? null : sideToMove === 'white' ? result.mateIn : -result.mateIn;
  return { evalWhiteCp, mateInWhite, bestUci: result.bestUci };
}

async function analyzeOneGame(
  game: ClaimedGame,
  moves: MoveForAnalysis[],
  options: Pick<AnalyzeOptions, 'engine' | 'nodes' | 'engineId'>,
): Promise<{ moveUpdates: MoveAnalysisUpdate[]; summary: GameAnalysisSummary }> {
  const bookBoundaryPly = moves.reduce((max, m) => (m.isBook ? Math.max(max, m.ply) : max), 0);
  const bookMoves = moves.filter((m) => m.ply <= bookBoundaryPly);
  const toAnalyze = moves.filter((m) => m.ply > bookBoundaryPly);

  const emptySummary: GameAnalysisSummary = {
    engineId: options.engineId,
    divergencePly: null,
    acpl: null,
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
  };
  if (toAnalyze.length === 0) return { moveUpdates: [], summary: emptySummary };

  const uciSoFar = bookMoves.map((m) => m.uci);
  // Posicion limite (ultima de libro, o la inicial si no hay libro): se evalua para tener el
  // "antes" de la primera jugada no-libro, pero esa fila de moves no se escribe (queda libro).
  let prev = await evaluatePosition(options.engine, uciSoFar, options.nodes);

  const moveUpdates: MoveAnalysisUpdate[] = [];
  const divergenceEntries: DivergenceEntry[] = [];
  let acplSum = 0;
  let acplCount = 0;
  let blunders = 0;
  let mistakes = 0;
  let inaccuracies = 0;

  for (const move of toAnalyze) {
    uciSoFar.push(move.uci);
    const current = await evaluatePosition(options.engine, uciSoFar, options.nodes);

    const sideMoved = sideThatMoved(move.ply);
    const { cpLoss, winPctLoss } = computeMoveLoss({
      evalBeforeWhite: prev.evalWhiteCp,
      evalAfterWhite: current.evalWhiteCp,
      sideMoved,
    });
    const evalBeforeMover = sideMoved === 'white' ? prev.evalWhiteCp : -prev.evalWhiteCp;
    const decided = isDecided(winPct(evalBeforeMover));
    const classification = classify(winPctLoss);

    moveUpdates.push({
      ply: move.ply,
      evalCp: current.evalWhiteCp,
      mateIn: current.mateInWhite,
      bestUci: current.bestUci,
      cpLoss,
      winPctLoss,
      classification,
      isDecided: decided,
    });
    divergenceEntries.push({ ply: move.ply, evalWhiteCp: current.evalWhiteCp });

    if (move.isMine && !move.isBook && !decided) {
      acplSum += cpLoss;
      acplCount += 1;
      if (classification === 3) blunders += 1;
      else if (classification === 2) mistakes += 1;
      else if (classification === 1) inaccuracies += 1;
    }

    prev = current;
  }

  const summary: GameAnalysisSummary = {
    engineId: options.engineId,
    divergencePly: computeDivergencePly(divergenceEntries, game.myColor),
    acpl: acplCount > 0 ? Math.round(acplSum / acplCount) : null,
    blunders,
    mistakes,
    inaccuracies,
  };
  return { moveUpdates, summary };
}

export async function runAnalyze(options: AnalyzeOptions): Promise<AnalyzeSummary> {
  const { store, environment, trigger } = options;
  const startedAt = Date.now();
  const jobRunId = await store.startJobRun({ kind: 'analyze', environment, trigger });

  let processed = 0;
  const failures: AnalyzeFailure[] = [];

  try {
    let remainingInBatch = options.batchSize;
    for (;;) {
      const lotSize = Math.min(10, Math.max(1, remainingInBatch));
      const games = await store.claimBatch(lotSize);
      if (games.length === 0) break;

      for (const game of games) {
        try {
          const moves = await store.loadMovesForGame(game.id);
          const { moveUpdates, summary } = await analyzeOneGame(game, moves, options);
          await store.saveAnalysis(game.id, moveUpdates, summary);
          processed += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push({ gameId: game.id, reason });
          await store.markFailed(game.id);
          log.warn('Partida marcada failed: fallo el analisis', { gameId: game.id, reason });
        }
      }

      remainingInBatch -= games.length;
      if (remainingInBatch <= 0) break;
    }

    const remaining = await store.countPending();
    const correlation = await store.correlationCheck();
    const durationMs = Date.now() - startedAt;
    const status: AnalyzeSummary['status'] = 'success';

    const summary: AnalyzeSummary = {
      jobRunId,
      status,
      processed,
      failed: failures.length,
      remaining,
      durationMs,
      correlation,
      failures,
    };

    await store.finishJobRun(jobRunId, {
      status,
      processed,
      failed: failures.length,
      skipped: 0,
      remaining,
      error: null,
      detail: { correlacion: correlation, fallidas: failures.slice(0, 50) },
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
      log.error('No se pudo cerrar la corrida de analyze en job_runs', {
        jobRunId,
        motivo: cierreFallido instanceof Error ? cierreFallido.message : String(cierreFallido),
      });
    }
    throw error;
  }
}
