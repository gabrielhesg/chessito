/**
 * Fase de la partida en un ply dado.
 *
 *   0 apertura: mientras is_book, o hasta el ply 20, lo que ocurra DESPUES. O sea el limite
 *      de apertura es el mayor entre el largo de la linea reconocida y 20.
 *   2 final: cuando el material sin peones ni reyes de los DOS bandos suma 13 puntos o menos
 *      (D=9, T=5, A=C=3).
 *   1 medio juego: el resto.
 *
 * Es pura y no toca la base de datos: recibe el material ya calculado por `lib/chess/pgn.ts`
 * (`materialAfter`), no vuelve a reproducir el PGN.
 *
 * ## Por que material y no conteo de piezas
 *
 * Hasta la revision integral el criterio era "cada bando tiene 6 piezas o menos, sin contar
 * peones ni reyes". Venia del punto 5 de docs/prompts/fase2-reloj.md, asi que el codigo era
 * fiel al spec y el error estaba en el spec. Al inicio cada bando tiene SIETE piezas
 * (D + 2T + 2A + 2C), asi que bastaba UN cambio por bando para declarar "final".
 *
 * Medido contra el historico real: 180.347 de 289.727 jugadas propias caian en "final", 853 de
 * 854 derrotas por tiempo tambien, y en rapida quedaban 2.041 jugadas de "final" contra 112 de
 * "medio juego". La app le decia al jugador que su problema eran los finales justo cuando su
 * debilidad declarada es el medio juego. Detalle en docs/review/00-inventario.md seccion 3.6.
 *
 * Los umbrales candidatos se midieron sobre 60 partidas reales de rapida (4.112 plies):
 *
 *   criterio                        apertura   medio   final   % final
 *   <=6 piezas por bando (el viejo)     1200     178    2734     66,5%
 *   <=3 piezas por bando                1200    1501    1411     34,3%
 *   suma <=6 piezas                     1200    1448    1464     35,6%
 *   material total <=20                 1200    1942     970     23,6%
 *   material total <=13  (el elegido)   1200    2227     685     16,7%
 *
 * Se eligio 13 porque es el unico que deja torre + pieza menor por bando (16 puntos) todavia
 * en medio juego, que es donde lo pondria cualquier manual.
 */
export type Phase = 0 | 1 | 2;

const OPENING_MIN_PLIES = 20;

/** Material no-peon de los DOS bandos bajo el cual empieza el final. D=9, T=5, A=C=3. */
export const ENDGAME_MAX_MATERIAL = 13;

export function isBookMove(ply: number, openingPlyCount: number): boolean {
  return ply <= openingPlyCount;
}

export function classifyPhase(input: {
  ply: number;
  openingPlyCount: number;
  /** Material sin peones ni reyes de cada bando DESPUES de la jugada. */
  materialAfter: { white: number; black: number };
}): Phase {
  const openingBoundary = Math.max(input.openingPlyCount, OPENING_MIN_PLIES);
  if (input.ply <= openingBoundary) return 0;
  if (input.materialAfter.white + input.materialAfter.black <= ENDGAME_MAX_MATERIAL) {
    return 2;
  }
  return 1;
}
