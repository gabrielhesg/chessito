/**
 * `score mate N` de UCI no es un centipeon. Se mapea a un cp extremo para poder reusar
 * `winPct` sin un camino especial: el clamp de +-1000 de winPct ya hace que un mate de
 * cualquier N quede en el techo/piso de la funcion (97,5% / 2,5%), que es lo correcto: dispara
 * is_decided igual que una posicion decisiva sin mate forzado.
 */
const MATE_CP = 10000;

/** `mateIn` viene en perspectiva del que mueve (positivo = mueve el que da mate). */
export function mateToCp(mateIn: number): number {
  return mateIn > 0 ? MATE_CP : -MATE_CP;
}
