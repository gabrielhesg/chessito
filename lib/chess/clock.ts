/**
 * Trampa 1 de CLAUDE.md: el tiempo usado en una jugada.
 *
 *   tiempo_usado(ply n) = clock_ms(ply n-2) - clock_ms(ply n) + incremento_ms
 *
 * Los tres errores clasicos que esta funcion evita:
 *   1. Olvidar el incremento: en 15+10 una jugada instantanea SUBE el reloj y `prev - actual`
 *      da negativo justo en las jugadas rapidas, que son las que interesan.
 *   2. Diferenciar contra el ply anterior en vez de contra el ply n-2. Los relojes de blancas
 *      y negras se intercalan en el PGN.
 *   3. Descartar los plies 1 y 2: su reloj previo si se conoce, es `base_seconds`.
 *
 * `%clk` viene truncado a decisegundos, asi que un resultado de hasta -100 ms es legitimo:
 * se clampea a 0 en vez de tratarlo como error.
 */

/** Convierte `0:14:52.3` (o `1:02:03`) a milisegundos. Devuelve null si no calza. */
export function parseClockToMs(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const match = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(raw.trim());
  if (!match?.[1] || !match[2] || !match[3]) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export type MoveTimeInput = {
  /** Reloj restante DESPUES de cada ply, en ms, en orden de ply. null donde no hay %clk. */
  clocksMs: readonly (number | null)[];
  baseSeconds: number;
  incrementSecs: number;
};

/**
 * Tiempo usado por ply, en ms, en el mismo orden que `clocksMs`.
 * Es null solo cuando falta el `%clk` necesario (correspondencia, por ejemplo).
 */
export function moveTimesMs({ clocksMs, baseSeconds, incrementSecs }: MoveTimeInput): (number | null)[] {
  const incrementMs = incrementSecs * 1000;
  const baseMs = baseSeconds * 1000;

  return clocksMs.map((current, index) => {
    if (current === null || current === undefined) return null;
    // Plies 1 y 2 (indices 0 y 1): el reloj previo del mismo jugador es el reloj inicial.
    const previous = index < 2 ? baseMs : (clocksMs[index - 2] ?? null);
    if (previous === null) return null;
    const used = previous - current + incrementMs;
    return used < 0 ? 0 : used;
  });
}
