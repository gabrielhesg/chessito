/**
 * Geometria de graficos: pura, sin React, sin DOM. Los graficos de esta app se dibujan como SVG
 * server-rendered, asi que todo el calculo vive aca y se testea como cualquier otra funcion del
 * dominio (misma regla que `lib/chess/clock.ts`).
 */

export type Escala = (valor: number) => number;

/**
 * Escala lineal de un dominio de datos a un rango de pixeles. Un dominio degenerado (min === max,
 * que pasa de verdad: un solo mes de datos, una sola partida) devuelve el centro del rango en vez
 * de dividir por cero.
 */
export function escalaLineal(
  [dominioMin, dominioMax]: readonly [number, number],
  [rangoMin, rangoMax]: readonly [number, number],
): Escala {
  const ancho = dominioMax - dominioMin;
  if (ancho === 0) {
    const centro = (rangoMin + rangoMax) / 2;
    return () => centro;
  }
  const factor = (rangoMax - rangoMin) / ancho;
  return (valor) => rangoMin + (valor - dominioMin) * factor;
}

/**
 * Marcas de eje en numeros "redondos" (1, 2, 2.5, 5, 10 y sus multiplos de 10), que es lo que
 * hace legible un eje. Devuelve las marcas DENTRO del dominio, incluidos los bordes si calzan.
 */
export function ticksLegibles(min: number, max: number, objetivo = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || objetivo < 1) return [];
  if (min === max) return [min];
  const [desde, hasta] = min < max ? [min, max] : [max, min];

  const pasoCrudo = (hasta - desde) / objetivo;
  const magnitud = 10 ** Math.floor(Math.log10(pasoCrudo));
  const normalizado = pasoCrudo / magnitud;
  const escalon = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10;
  const paso = escalon * magnitud;

  const ticks: number[] = [];
  const primero = Math.ceil(desde / paso) * paso;
  // El epsilon evita perder la ultima marca por error de coma flotante (0.1 + 0.2 y familia).
  for (let t = primero; t <= hasta + paso * 1e-9; t += paso) {
    ticks.push(Number.parseFloat(t.toPrecision(12)));
  }
  return ticks;
}

/** Acota un valor a un rango. Usado para no dibujar fuera del area del grafico. */
export function acotar(valor: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, valor));
}
