/**
 * Fase de la partida en un ply dado (docs/prompts/fase2-reloj.md, punto 5).
 *
 *   0 apertura: mientras is_book, o hasta el ply 20, lo que ocurra DESPUES. O sea el limite
 *      de apertura es el mayor entre el largo de la linea reconocida y 20.
 *   2 final: cuando cada bando tiene 6 piezas o menos, SIN CONTAR peones ni reyes.
 *   1 medio juego: el resto.
 *
 * Es pura y no toca la base de datos: recibe el conteo de piezas ya calculado por
 * `lib/chess/pgn.ts` (`piecesAfter`), no vuelve a reproducir el PGN.
 */
export type Phase = 0 | 1 | 2;

const OPENING_MIN_PLIES = 20;
const ENDGAME_MAX_PIECES = 6;

export function isBookMove(ply: number, openingPlyCount: number): boolean {
  return ply <= openingPlyCount;
}

export function classifyPhase(input: {
  ply: number;
  openingPlyCount: number;
  piecesAfter: { white: number; black: number };
}): Phase {
  const openingBoundary = Math.max(input.openingPlyCount, OPENING_MIN_PLIES);
  if (input.ply <= openingBoundary) return 0;
  if (input.piecesAfter.white <= ENDGAME_MAX_PIECES && input.piecesAfter.black <= ENDGAME_MAX_PIECES) {
    return 2;
  }
  return 1;
}
