/**
 * Los DOS pasos de signo (docs/ANALYSIS-SPEC.md, "Los DOS pasos de signo. Ambos son
 * obligatorios."). Es el punto donde mas proyectos caseros producen resultados invertidos en
 * silencio: sin el paso 2, TODOS los errores de Gabriel con negras dan perdida negativa, caen
 * en classification 0, y desaparecen del analisis sin que nada avise.
 */
import type { GameColor } from '@/lib/chess/game';
import { winPct } from './winpct';

/**
 * Paso 1: `score cp` de UCI viene en perspectiva del que mueve EN LA POSICION EVALUADA
 * (`sideToMove`, no de quien acaba de jugar). Normaliza a perspectiva de blancas.
 */
export function toWhitePerspective(scoreCp: number, sideToMove: GameColor): number {
  return sideToMove === 'white' ? scoreCp : -scoreCp;
}

export type MoveLoss = {
  /** >= 0, en perspectiva del que movio (docs/ANALYSIS-SPEC.md). */
  cpLoss: number;
  /** >= 0, en perspectiva del que movio. */
  winPctLoss: number;
};

/**
 * Paso 2: `evalBeforeWhite`/`evalAfterWhite` ya estan en perspectiva de blancas (post paso 1).
 * Por eso una mala jugada de NEGRAS hace SUBIR esos valores: hay que volver a girar el delta
 * segun quien movio, o la perdida de negras sale negativa y desaparece con el clamp a 0.
 */
export function computeMoveLoss({
  evalBeforeWhite,
  evalAfterWhite,
  sideMoved,
}: {
  evalBeforeWhite: number;
  evalAfterWhite: number;
  sideMoved: GameColor;
}): MoveLoss {
  const wpAntes = winPct(evalBeforeWhite);
  const wpDespues = winPct(evalAfterWhite);

  const whiteMoved = sideMoved === 'white';
  const winPctLoss = Math.max(0, whiteMoved ? wpAntes - wpDespues : wpDespues - wpAntes);
  const cpLoss = Math.max(0, whiteMoved ? evalBeforeWhite - evalAfterWhite : evalAfterWhite - evalBeforeWhite);

  return { cpLoss, winPctLoss };
}
