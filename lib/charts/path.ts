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

/**
 * Catmull-Rom convertido a Bezier cubica: pasa POR todos los puntos (a diferencia de una Bezier
 * suelta, que solo los usa como imanes) y deja la curva suave. Es lo que convierte el grafico de
 * evaluacion de una linea quebrada en una curva legible.
 *
 * `tension` 0 es una recta y 1 es la curva canonica de Catmull-Rom. Por encima de 1 la curva
 * empieza a dar latigazos, asi que se acota.
 *
 * `limiteY` acota las coordenadas de control: una Catmull-Rom SOBREPASA el rango cuando pasa por
 * un pico (un mate seguido de una posicion igualada es exactamente ese caso), y sin el limite la
 * curva se sale de la caja del SVG.
 */
export function caminoCurva(
  puntos: readonly Punto[],
  { tension = 1, limiteY }: { tension?: number; limiteY?: [number, number] } = {},
): string {
  if (puntos.length === 0) return '';
  const primero = puntos[0];
  if (!primero) return '';
  if (puntos.length < 3) return caminoLinea(puntos);

  const t = Math.max(0, Math.min(1, tension)) / 6;
  const acotarY = (y: number): number => {
    if (!limiteY) return y;
    const [min, max] = limiteY;
    return Math.max(min, Math.min(max, y));
  };

  const partes = [`M${redondear(primero.x)} ${redondear(primero.y)}`];
  for (let i = 0; i < puntos.length - 1; i += 1) {
    // p0 y p3 son los vecinos que dan la direccion; en los extremos se repite el propio punto.
    const p0 = puntos[i - 1] ?? puntos[i];
    const p1 = puntos[i];
    const p2 = puntos[i + 1];
    const p3 = puntos[i + 2] ?? puntos[i + 1];
    if (!p0 || !p1 || !p2 || !p3) continue;

    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = acotarY(p1.y + (p2.y - p0.y) * t);
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = acotarY(p2.y - (p3.y - p1.y) * t);

    partes.push(
      `C${redondear(c1x)} ${redondear(c1y)}, ${redondear(c2x)} ${redondear(c2y)}, ${redondear(p2.x)} ${redondear(p2.y)}`,
    );
  }
  return partes.join(' ');
}

/** La version curva de `caminoArea`: misma curva, cerrada contra la linea base. */
export function caminoAreaCurva(
  puntos: readonly Punto[],
  baseY: number,
  opciones: { tension?: number; limiteY?: [number, number] } = {},
): string {
  if (puntos.length === 0) return '';
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (!primero || !ultimo) return '';
  const curva = caminoCurva(puntos, opciones);
  // La curva ya arranca con `M` en el primer punto; se le antepone la bajada a la base y se cierra.
  return [
    `M${redondear(primero.x)} ${redondear(baseY)}`,
    `L${redondear(primero.x)} ${redondear(primero.y)}`,
    curva.replace(/^M[^C]*/, ''),
    `L${redondear(ultimo.x)} ${redondear(baseY)}`,
    'Z',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Interpolacion cubica MONOTONA (Fritsch-Carlson). Pasa por todos los puntos, igual que
 * `caminoCurva`, pero **no se sale del rango de los datos por construccion**: entre dos puntos la
 * curva nunca sube por encima del mayor ni baja del menor.
 *
 * Existe porque `caminoCurva` con `limiteY` recorta los puntos de CONTROL sin mover sus anclas, y
 * eso quiebra la tangente en cada pico: en una partida de 130 jugadas con evaluaciones de mate son
 * decenas de quiebres, y por eso la curva del grafico de evaluacion no se veia suave. Aca no hay
 * nada que recortar.
 *
 * `caminoCurva` se deja intacta: tiene tests y su `limiteY` esta documentado como necesario, igual
 * que la Fase 8 no toco `caminoLinea`.
 */
export function caminoMonotono(puntos: readonly Punto[]): string {
  if (puntos.length === 0) return '';
  if (puntos.length < 3) return caminoLinea(puntos);

  const n = puntos.length;
  // Pendiente de cada tramo, y ancho del tramo.
  const deltas: number[] = [];
  const anchos: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const a = puntos[i];
    const b = puntos[i + 1];
    if (!a || !b) return caminoLinea(puntos);
    const h = b.x - a.x;
    anchos.push(h);
    deltas.push(h === 0 ? 0 : (b.y - a.y) / h);
  }

  // Tangente en cada punto. La media armonica de las dos pendientes vecinas es lo que garantiza
  // la monotonia; un cambio de signo (un pico) fuerza tangente 0, que es justo lo que evita que
  // la curva se pase del rango.
  const tangentes: number[] = new Array<number>(n).fill(0);
  tangentes[0] = deltas[0] ?? 0;
  tangentes[n - 1] = deltas[n - 2] ?? 0;
  for (let i = 1; i < n - 1; i += 1) {
    const anterior = deltas[i - 1] ?? 0;
    const siguiente = deltas[i] ?? 0;
    if (anterior * siguiente <= 0) {
      tangentes[i] = 0;
      continue;
    }
    const hA = anchos[i - 1] ?? 1;
    const hB = anchos[i] ?? 1;
    const w1 = 2 * hB + hA;
    const w2 = hB + 2 * hA;
    tangentes[i] = (w1 + w2) / (w1 / anterior + w2 / siguiente);
  }

  const primero = puntos[0];
  if (!primero) return '';
  const partes = [`M${redondear(primero.x)} ${redondear(primero.y)}`];
  for (let i = 0; i < n - 1; i += 1) {
    const p1 = puntos[i];
    const p2 = puntos[i + 1];
    if (!p1 || !p2) continue;
    const h = (anchos[i] ?? 0) / 3;
    const c1y = p1.y + (tangentes[i] ?? 0) * h;
    const c2y = p2.y - (tangentes[i + 1] ?? 0) * h;
    partes.push(
      `C${redondear(p1.x + h)} ${redondear(c1y)}, ${redondear(p2.x - h)} ${redondear(c2y)}, ${redondear(p2.x)} ${redondear(p2.y)}`,
    );
  }
  return partes.join(' ');
}

/** La version de area de `caminoMonotono`: misma curva, cerrada contra una linea base. */
export function caminoAreaMonotono(puntos: readonly Punto[], baseY: number): string {
  if (puntos.length === 0) return '';
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (!primero || !ultimo) return '';
  return [
    `M${redondear(primero.x)} ${redondear(baseY)}`,
    `L${redondear(primero.x)} ${redondear(primero.y)}`,
    caminoMonotono(puntos).replace(/^M[^C]*/, ''),
    `L${redondear(ultimo.x)} ${redondear(baseY)}`,
    'Z',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
