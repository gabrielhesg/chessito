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

export type RelojesEnPly = {
  /** Milisegundos que le quedaban a blancas despues del ply pedido. null si no se puede saber. */
  blancas: number | null;
  negras: number | null;
};

/**
 * Cuanto le quedaba a CADA jugador en un momento de la partida, para mostrar los dos relojes
 * junto al tablero como en cualquier visor.
 *
 * `moves.clock_ms` guarda el reloj de quien acaba de mover, asi que los dos relojes se
 * intercalan: el de blancas es el ultimo ply IMPAR <= al pedido, el de negras el ultimo PAR.
 * Es la misma trampa del ply n-2 de `moveTimesMs`, vista desde el otro lado.
 *
 * Antes de que un bando haya movido, su reloj no es null: es el tiempo base del control de
 * tiempo. Si fuera null, los dos relojes aparecerian vacios en la posicion inicial, que es
 * justo cuando mas obvio es cuanto tiempo habia.
 *
 * `ply` 0 es la posicion inicial. Un `clock_ms` null (correspondencia sin %clk) se salta y se
 * sigue buscando hacia atras, en vez de dar por perdido el reloj de ese bando.
 */
export function relojesEnPly(
  clocksMs: readonly (number | null)[],
  ply: number,
  baseSeconds: number,
): RelojesEnPly {
  const base = baseSeconds > 0 ? baseSeconds * 1000 : null;
  const hasta = Math.max(0, Math.min(ply, clocksMs.length));

  const ultimoDe = (impar: boolean): number | null => {
    for (let i = hasta; i >= 1; i -= 1) {
      // i es el numero de ply (1-based); el arreglo esta indexado desde 0.
      if (i % 2 === 1 !== impar) continue;
      const valor = clocksMs[i - 1];
      if (valor !== null && valor !== undefined) return valor;
    }
    return base;
  };

  return { blancas: ultimoDe(true), negras: ultimoDe(false) };
}

/** `614000` -> `"10:14"`. Bajo un minuto muestra decimas, que es cuando importan. */
export function formatClock(ms: number | null): string {
  if (ms === null) return '—';
  const total = Math.max(0, ms) / 1000;
  const minutos = Math.floor(total / 60);
  const segundos = total - minutos * 60;
  if (minutos === 0 && segundos < 60) return `0:${segundos.toFixed(1).padStart(4, '0')}`;
  return `${minutos}:${String(Math.floor(segundos)).padStart(2, '0')}`;
}
