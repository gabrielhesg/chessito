/**
 * De un PGN a las filas de `moves`. Es la pieza central de la Fase 2: junta el parseo
 * (`pgn.ts`), el reloj (`clock.ts`) y la fase (`phase.ts`) en una sola funcion pura, para que
 * `scripts/extract-moves.ts` solo tenga que leer partidas y escribir filas.
 */
import { classifyPhase, isBookMove } from './phase';
import { moveTimesMs } from './clock';
import { parsePgn } from './pgn';

export type MoveRow = {
  ply: number;
  is_mine: boolean;
  san: string;
  uci: string;
  phase: 0 | 1 | 2;
  clock_ms: number | null;
  move_time_ms: number | null;
  is_book: boolean;
};

export type BuildMoveRowsInput = {
  pgn: string;
  myColor: 'white' | 'black';
  baseSeconds: number;
  incrementSecs: number;
  /** `openings.ply_count` de `games.opening_id`. 0 si la partida no tiene apertura resuelta. */
  openingPlyCount: number;
};

export function buildMoveRows(input: BuildMoveRowsInput): MoveRow[] {
  const parsed = parsePgn(input.pgn);
  const clocksMs = parsed.moves.map((move) => move.clockMs);
  const times = moveTimesMs({
    clocksMs,
    baseSeconds: input.baseSeconds,
    incrementSecs: input.incrementSecs,
  });

  return parsed.moves.map((move, index) => {
    // Ply impar = jugada de blancas (1, 3, 5...); par = negras.
    const isMine = input.myColor === 'white' ? move.ply % 2 === 1 : move.ply % 2 === 0;
    return {
      ply: move.ply,
      is_mine: isMine,
      san: move.san,
      uci: move.uci,
      phase: classifyPhase({
        ply: move.ply,
        openingPlyCount: input.openingPlyCount,
        piecesAfter: move.piecesAfter,
      }),
      clock_ms: move.clockMs,
      move_time_ms: times[index] ?? null,
      is_book: isBookMove(move.ply, input.openingPlyCount),
    };
  });
}
