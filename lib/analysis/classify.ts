/**
 * Umbrales de docs/ANALYSIS-SPEC.md: por caida de win%, no por centipeones (la convencion de
 * centipeones ordena al reves justo donde mas importa, ver la seccion "Por que no clasificar
 * por centipeones" del spec).
 */
export type Classification = 0 | 1 | 2 | 3;

export function classify(winPctLoss: number): Classification {
  if (winPctLoss >= 30) return 3;
  if (winPctLoss >= 20) return 2;
  if (winPctLoss >= 10) return 1;
  return 0;
}

/**
 * `winPctBeforeMover` es el win% ANTES de la jugada, desde la perspectiva del que mueve (no de
 * blancas). Jugar flojo en una partida ya decidida no mueve las tasas de error por razones
 * equivocadas.
 */
export function isDecided(winPctBeforeMover: number): boolean {
  return winPctBeforeMover > 95 || winPctBeforeMover < 5;
}
