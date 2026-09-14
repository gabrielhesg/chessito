/**
 * Reimplementacion en TypeScript de la funcion SQL `win_pct` (supabase/migrations/0001_init.sql).
 * Tiene que dar EXACTAMENTE el mismo resultado: is_decided se calcula jugada a jugada durante
 * el analisis, antes de escribir a la base, no despues con una consulta agregada.
 *
 * Formula de Lichess. cp se clampea a +-1000 antes de convertir (docs/ANALYSIS-SPEC.md).
 */
export function winPct(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}
