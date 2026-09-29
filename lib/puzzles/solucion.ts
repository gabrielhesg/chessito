/**
 * Cuántas jugadas propias puede pedir un ejercicio como máximo.
 *
 * Tres: la del ejercicio y dos de continuación. Con las respuestas del rival intercaladas son
 * cinco plies, que es el largo de un ejercicio de táctica normal.
 */
export const JUGADAS_PROPIAS_MAXIMAS = 3;

/**
 * La línea que hay que REPRODUCIR, acotada. No es lo mismo que la línea que se guarda.
 *
 * `puzzles.solution_line` es el PV completo del motor, y eso resultó ser un problema medido en
 * uso real: la mediana son **19 plies** (media 18,6, máximo 43), y el 92,8 % de los 2.600
 * ejercicios pide 5 o más. Un ejercicio de 19 plies exige acertar **diez jugadas propias
 * seguidas** en el orden exacto del motor — eso no es una táctica, es memorizar una variante de
 * computador, y a 1250 es imposible por construcción.
 *
 * Se descubrió porque en una semana hubo 12 intentos sobre UN solo ejercicio, 11 fallados y 5 con
 * pista. Ningún test lo habría encontrado: todos pasaban porque la lógica de comparar jugada
 * contra jugada es correcta. Lo que estaba mal era cuántas jugadas se piden.
 *
 * **El corte va acá y no al construir el ejercicio, a propósito.** La línea completa se sigue
 * guardando y `explicarBlunder` la sigue usando entera para explicar por qué la jugada era buena:
 * lo que se acota es lo que hay que *acertar*, que es otra cosa. Así tampoco hace falta
 * reconstruir los 2.600 ejercicios ya creados.
 */
export function lineaAReproducir(
  solutionLine: readonly string[] | null,
  bestUci: string,
  maxPropias: number = JUGADAS_PROPIAS_MAXIMAS,
): string[] {
  const completa = solutionLine?.length ? [...solutionLine] : [bestUci];
  // Las jugadas propias son las de índice par (0, 2, 4…): entre ellas van las del rival. Para
  // `n` jugadas propias hacen falta `2n - 1` plies, porque la última no necesita respuesta.
  return completa.slice(0, Math.max(1, maxPropias * 2 - 1));
}
