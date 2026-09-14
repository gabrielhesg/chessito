/** Constructores del atributo `d` de un `<path>` de SVG. Puros: reciben puntos, devuelven texto. */

export type Punto = { x: number; y: number };

function redondear(n: number): string {
  // Dos decimales alcanzan de sobra para pixeles y evitan que el SVG quede lleno de ruido.
  return Number.parseFloat(n.toFixed(2)).toString();
}

export function caminoLinea(puntos: readonly Punto[]): string {
  if (puntos.length === 0) return '';
  return puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${redondear(p.x)} ${redondear(p.y)}`)
    .join(' ');
}

/**
 * Area cerrada contra una linea base horizontal. Se usa para el grafico de evaluacion, donde la
 * base es el cero (posicion igualada) y no el borde inferior del grafico.
 */
export function caminoArea(puntos: readonly Punto[], baseY: number): string {
  if (puntos.length === 0) return '';
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (!primero || !ultimo) return '';
  return [
    `M${redondear(primero.x)} ${redondear(baseY)}`,
    ...puntos.map((p) => `L${redondear(p.x)} ${redondear(p.y)}`),
    `L${redondear(ultimo.x)} ${redondear(baseY)}`,
    'Z',
  ].join(' ');
}
