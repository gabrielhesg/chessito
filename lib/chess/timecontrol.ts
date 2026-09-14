/**
 * Parseo del campo `time_control` de chess.com.
 *
 * Tres formatos posibles, y el tercero es la trampa 5 de CLAUDE.md:
 *   '600'      -> 10 minutos, sin incremento
 *   '900+10'   -> 15 minutos con 10 segundos de incremento
 *   '1/86400'  -> correspondencia: un dia POR JUGADA. Queda fuera del analisis de reloj y
 *                 de motor (analysis_state = 'skipped').
 *   '-'        -> sin control de tiempo. Lo traen las partidas "Play vs Coach" de chess.com,
 *                 que ademas NO traen %clk. Se tratan como correspondencia: se ingieren y se
 *                 marcan 'skipped'.
 */

export type TimeControl = {
  /** Segundos iniciales del reloj. En correspondencia, segundos por jugada. */
  baseSeconds: number;
  incrementSecs: number;
  isCorrespondence: boolean;
};

export function parseTimeControl(raw: string): TimeControl {
  const value = raw.trim();

  if (value === '-') {
    return { baseSeconds: 0, incrementSecs: 0, isCorrespondence: true };
  }

  const correspondence = /^1\/(\d+)$/.exec(value);
  if (correspondence?.[1]) {
    return {
      baseSeconds: Number.parseInt(correspondence[1], 10),
      incrementSecs: 0,
      isCorrespondence: true,
    };
  }

  const withIncrement = /^(\d+)\+(\d+)$/.exec(value);
  if (withIncrement?.[1] && withIncrement[2]) {
    return {
      baseSeconds: Number.parseInt(withIncrement[1], 10),
      incrementSecs: Number.parseInt(withIncrement[2], 10),
      isCorrespondence: false,
    };
  }

  const plain = /^(\d+)$/.exec(value);
  if (plain?.[1]) {
    return {
      baseSeconds: Number.parseInt(plain[1], 10),
      incrementSecs: 0,
      isCorrespondence: false,
    };
  }

  throw new Error(`time_control no reconocido: "${raw}"`);
}

/**
 * Notacion legible para la UI, la que todo jugador ya reconoce de chess.com/lichess
 * ("2+1", "10 min"), no el crudo en segundos que devuelve la API ("120+1", "600").
 * `raw === '-'` y `raw` con forma `1/N` comparten `isCorrespondence`, pero no deben leerse
 * igual (trampa 5 de CLAUDE.md: el primero es "Play vs Coach", el segundo correspondencia real).
 */
export function formatTimeControl(raw: string): string {
  const parsed = parseTimeControl(raw);

  if (parsed.isCorrespondence) {
    return raw.trim() === '-' ? 'vs coach' : 'correspondencia';
  }

  const minutos = parsed.baseSeconds / 60;
  const base = Number.isInteger(minutos) ? `${minutos}` : `${(parsed.baseSeconds / 60).toFixed(1)}`;
  const baseLabel = parsed.incrementSecs > 0 ? `${base}+${parsed.incrementSecs}` : `${base} min`;
  return baseLabel;
}
