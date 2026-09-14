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

export async function recordAttempt(puzzleId: number, correct: boolean, msTaken: number): Promise<void> {
  const client = supabaseAdmin();

  const { data: puzzle, error: fetchError } = await client
    .from('puzzles')
    .select('ease, interval_days, lapses')
    .eq('id', puzzleId)
    .single();
  if (fetchError || !puzzle) {
    log.error('No se pudo leer el ejercicio para actualizar su repeticion espaciada', {
      puzzleId,
      error: fetchError?.message,
    });
    return;
  }

  const { error: attemptError } = await client
    .from('puzzle_attempts')
    .insert({ puzzle_id: puzzleId, correct, ms_taken: msTaken });
  if (attemptError) {
    log.error('No se pudo registrar el intento', { puzzleId, error: attemptError.message });
  }

  const result = nextReview(
    { ease: puzzle.ease, intervalDays: puzzle.interval_days, lapses: puzzle.lapses },
    correct,
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
    .eq('id', puzzleId);
  if (updateError) {
    log.error('No se pudo actualizar la repeticion espaciada del ejercicio', {
      puzzleId,
      error: updateError.message,
    });
  }
}
