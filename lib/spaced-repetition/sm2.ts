/**
 * Repeticion espaciada, SM-2 simplificado (docs/prompts/fase4-entrenador.md, punto 4).
 *
 * Puro: recibe `now` en vez de llamar a `Date.now()`/`new Date()` internamente, para poder
 * testearse con fechas fijas. La llamada real (lib/spaced-repetition/actions.ts) pasa
 * `new Date()`.
 */
export type ReviewState = { ease: number; intervalDays: number; lapses: number };
export type ReviewResult = ReviewState & { dueAt: Date };

const MIN_EASE = 1.3;
const MAX_EASE = 2.5;
const CORRECT_EASE_DELTA = 0.1;
const INCORRECT_EASE_DELTA = -0.2;

function clampEase(ease: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, ease));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Falla: intervalo vuelve a 0 (debido hoy mismo), suma un lapso, y la facilidad baja.
 * Acierto: la facilidad sube, y el intervalo se multiplica por la facilidad (minimo 1 dia,
 * arrancando en 1 dia si el intervalo previo era 0).
 */
export function nextReview(state: ReviewState, correct: boolean, now: Date): ReviewResult {
  if (!correct) {
    return {
      ease: clampEase(state.ease + INCORRECT_EASE_DELTA),
      intervalDays: 0,
      lapses: state.lapses + 1,
      dueAt: now,
    };
  }

  const ease = clampEase(state.ease + CORRECT_EASE_DELTA);
  const intervalDays = state.intervalDays === 0 ? 1 : Math.max(1, Math.round(state.intervalDays * ease));
  return { ease, intervalDays, lapses: state.lapses, dueAt: addDays(now, intervalDays) };
}
