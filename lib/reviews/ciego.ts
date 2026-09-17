/**
 * Modo "Primero yo": las dos decisiones puras detras de el.
 *
 * Viven aca y no dentro de `app/partida/[id]/page.tsx` por una razon concreta: la promesa del
 * modo ciego es que la evaluacion **no viaja al navegador**, y una promesa asi hay que poder
 * probarla. Un `display: none` en el componente se veria igual en pantalla y seria falso.
 */

/** Lo que un ply necesita tener para pasar por el despojo. Es el subconjunto de `JugadaUI`. */
export type JugadaDelMotor = {
  bestUci: string | null;
  evalCp: number | null;
  mateIn: number | null;
  cpLoss: number | null;
  classification: number | null;
};

/**
 * El ritual del plan de entrenamiento es analizar la derrota SIN motor antes de verlo, y solo
 * aplica a las derrotas de rapida:
 *
 * - una victoria no tiene ritual;
 * - revisar bala no esta en el plan, y en bala no hay tiempo para calcular, asi que el error
 *   dice mas del reloj que de lo que el jugador entiende;
 * - una partida ya revisada se abre normal, porque el ejercicio ya ocurrio;
 * - `revelar` es el escape visible: el ritual no se obliga.
 */
export function esModoCiego(input: {
  timeClass: string;
  result: string;
  yaRevisada: boolean;
  revelar: boolean;
}): boolean {
  if (input.timeClass !== 'rapid') return false;
  if (input.result !== 'loss') return false;
  if (input.yaRevisada) return false;
  return !input.revelar;
}

/**
 * Deja en null TODO lo que el motor aporta, y solo eso. Lo que se conserva sale del PGN y del
 * reloj (`san`, `uci`, `isMine`, `isBook`, `moveTimeMs`, `clockMs`): navegar la partida y ver
 * cuanto pensaste en cada jugada es justamente lo que el ritual necesita.
 *
 * `isBook` se queda a proposito aunque suene a analisis: sale de la tabla `openings`, no de
 * Stockfish, y saber donde se acabo la teoria no adelanta donde estuvo el error.
 */
export function despojarDelMotor<T extends JugadaDelMotor>(jugada: T): T {
  return { ...jugada, bestUci: null, evalCp: null, mateIn: null, cpLoss: null, classification: null };
}
