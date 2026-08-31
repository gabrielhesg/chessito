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
