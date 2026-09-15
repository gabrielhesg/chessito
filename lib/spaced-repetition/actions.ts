'use server';

/**
 * `recordAttempt`: la unica escritura interactiva de la app (a diferencia de `dispatchWorkflow`
 * en lib/github.ts, que solo llama a la API de GitHub). Usa `supabaseAdmin()` (PostgREST +
 * service role), el mismo transporte que `lib/data.ts`: la app corre en Vercel, no es un script
 * batch, asi que no aplica la regla de conexion directa a Postgres (esa es solo para
 * scripts/GitHub Actions, ver lib/analysis/store.ts).
 *
 * Todo el archivo lleva `'use server'` (no solo la funcion) para poder importarla directo desde
 * `components/TrainerBoard.tsx` (`'use client'`), que la llama por click, no por un `<form>`.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { nextReview } from './sm2';

export type Intento = {
  puzzleId: number;
  /** La jugada intentada. Sin esto no hay forma de saber que error se repite. */
  playedUci: string;
  correct: boolean;
  msTaken: number;
  /** 1 para el primer intento del ejercicio en esta sesion, 2 para el segundo, etc. */
  attemptNo: number;
  hintUsed: boolean;
  /**
   * En que concepto se fallo, derivado de la jugada REALMENTE probada. null si acerto o si la
   * jugada no fue lo bastante mala. Es lo que despues permite servir otro ejercicio del mismo
   * concepto, en vez de repetir la misma posicion hasta memorizarla.
   */
  concepto?: string | null;
};

/**
 * Cada intento se guarda, pero la repeticion espaciada SOLO se actualiza al cerrar el ejercicio
 * (`cierra: true`), y se califica por si se acerto **al primer intento sin pista**. Es lo que
 * mantiene honesto el SM-2: si reintentar contara como acierto, un ejercicio fallado tres veces
 * y acertado a la cuarta se programaria como si se supiera, y dejaria de aparecer.
 */
export async function recordAttempt(intento: Intento & { cierra: boolean }): Promise<void> {
  const client = supabaseAdmin();

  const { error: attemptError } = await client.from('puzzle_attempts').insert({
    puzzle_id: intento.puzzleId,
    correct: intento.correct,
    ms_taken: intento.msTaken,
    played_uci: intento.playedUci,
    attempt_no: intento.attemptNo,
    hint_used: intento.hintUsed,
    concepto: intento.concepto ?? null,
  });
  if (attemptError) {
    log.error('No se pudo registrar el intento', { puzzleId: intento.puzzleId, error: attemptError.message });
  }

  if (!intento.cierra) return;

  const { data: puzzle, error: fetchError } = await client
    .from('puzzles')
    .select('ease, interval_days, lapses')
    .eq('id', intento.puzzleId)
    .single();
  if (fetchError || !puzzle) {
    log.error('No se pudo leer el ejercicio para actualizar su repeticion espaciada', {
      puzzleId: intento.puzzleId,
      error: fetchError?.message,
    });
    return;
  }

  const limpio = intento.correct && intento.attemptNo === 1 && !intento.hintUsed;
  const result = nextReview(
    { ease: puzzle.ease, intervalDays: puzzle.interval_days, lapses: puzzle.lapses },
    limpio,
    new Date(),
  );

  const { error: updateError } = await client
    .from('puzzles')
    .update({
      due_at: result.dueAt.toISOString(),
      interval_days: result.intervalDays,
      ease: result.ease,
      lapses: result.lapses,
    })
    .eq('id', intento.puzzleId);
  if (updateError) {
    log.error('No se pudo actualizar la repeticion espaciada del ejercicio', {
      puzzleId: intento.puzzleId,
      error: updateError.message,
    });
  }
}
