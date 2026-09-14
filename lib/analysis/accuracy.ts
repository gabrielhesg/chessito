/**
 * Precision de una partida, 0 a 100. Es la cifra que Chess.com llama CAPS y Lichess "accuracy",
 * y la que falta en esta app: el ACPL existe desde la Fase 3, pero "27 centipeones por jugada"
 * no le dice nada a nadie, y "84 de precision" si.
 *
 * Formula de Lichess, que es la publica y la que se puede verificar:
 *
 *   precision_de_una_jugada = 103.1668 * e^(-0.04354 * caida_de_win%) - 3.1669
 *
 * donde `caida_de_win%` es cuanto bajo tu probabilidad de ganar (0-100) con esa jugada. La
 * constante deja una jugada perfecta en ~100 y una que tira la partida cerca de 0. El resultado
 * se acota a [0, 100] porque la exponencial pasa un poco de 100 cuando la caida es 0.
 *
 * La precision de la PARTIDA es el promedio simple de sus jugadas. Lichess usa un promedio
 * ponderado por la volatilidad de la posicion; acá no, a proposito: esa ponderacion necesita una
 * ventana movil sobre la evaluacion y hace el numero imposible de explicar. Se documenta como
 * calculo propio y se muestra junto al ACPL, nunca como "el numero de chess.com".
 */

/**
 * Precision de una sola jugada, dada la caida de win% que provoco (en puntos de 0 a 100).
 *
 * Se redondea a dos decimales porque las constantes publicadas dejan una jugada perfecta en
 * 99.9999 y no en 100: es ruido de precision de la formula, no una diferencia real, y mostrar
 * "99.9999" en una jugada impecable seria confuso.
 */
export function accuracyDeJugada(caidaWinPct: number): number {
  const caida = Math.max(0, caidaWinPct);
  const bruto = 103.1668 * Math.exp(-0.04354 * caida) - 3.1669;
  return Math.round(Math.max(0, Math.min(100, bruto)) * 100) / 100;
}

/**
 * Precision de la partida: promedio de las jugadas que cuentan.
 *
 * Se excluyen las jugadas de libro y las de una partida ya decidida, por la misma razon por la
 * que las excluye /errores: jugar de memoria no demuestra precision, y jugar flojo con la
 * partida ganada o perdida no es un error. Devuelve null si no queda ninguna jugada que contar,
 * en vez de un 100 enganoso.
 */
export function accuracyDePartida(
  jugadas: ReadonlyArray<{ winPctLoss: number | null; isBook: boolean; isDecided: boolean }>,
): number | null {
  const cuentan = jugadas.filter((j) => !j.isBook && !j.isDecided && j.winPctLoss !== null);
  if (cuentan.length === 0) return null;
  const suma = cuentan.reduce((acc, j) => acc + accuracyDeJugada(j.winPctLoss ?? 0), 0);
  return Math.round((suma / cuentan.length) * 10) / 10;
}
