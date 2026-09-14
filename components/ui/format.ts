/** Umbral del proyecto: bajo 20 partidas un corte es ruido y no lleva recomendacion. */
export const N_MINIMO = 20;

export function filaAtenuada(n: number): string {
  return n < N_MINIMO ? 'opacity-45' : '';
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

/** Centipeones a la notacion de ventaja que usa todo el ajedrez: +1.5, -0.8, 0.0. */
export function cpAPeones(cp: number | null | undefined): string {
  if (cp === null || cp === undefined) return '—';
  const peones = cp / 100;
  return `${peones > 0 ? '+' : ''}${peones.toFixed(1)}`;
}
