/**
 * `divergence_ply`: la metrica mas accionable del proyecto (docs/ANALYSIS-SPEC.md). Calculado
 * EN LA PERSPECTIVA DE GABRIEL, no la de blancas: eval_cp esta normalizado a blancas, asi que
 * en sus partidas con negras hay que girarlo, o el resultado no tiene sentido en la mitad de
 * las partidas.
 *
 * Definicion: el primer ply donde `eval_mia` cae bajo -100 y no vuelve a superar -50 en el
 * resto de la partida. null si nunca ocurre.
 */
import type { GameColor } from '@/lib/chess/game';

export type DivergenceEntry = { ply: number; evalWhiteCp: number };

export function computeDivergencePly(entries: readonly DivergenceEntry[], myColor: GameColor): number | null {
  const mine = entries.map((e) => (myColor === 'white' ? e.evalWhiteCp : -e.evalWhiteCp));
  const n = mine.length;
  const suffixMax = new Array<number>(n);
  let runningMax = -Infinity;
  for (let i = n - 1; i >= 0; i--) {
    runningMax = Math.max(runningMax, mine[i]!);
    suffixMax[i] = runningMax;
  }
  for (let i = 0; i < n; i++) {
    if (mine[i]! < -100 && suffixMax[i]! <= -50) {
      return entries[i]!.ply;
    }
  }
  return null;
}
