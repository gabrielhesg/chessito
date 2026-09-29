'use server';

/**
 * Las dos acciones que acercan una partida recién jugada al entrenador. Viven acá y no dentro de
 * una página porque las usan dos: la portada ("Actualizar ahora") y el selector de partidas del
 * entrenador.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { appEnv, env } from '@/lib/env';
import { dispatchWorkflow } from '@/lib/github';
import { runExtractMoves } from '@/lib/ingest/extract-moves';
import { runIngest } from '@/lib/ingest/run';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { log } from '@/lib/log';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Traer las partidas nuevas, dejarlas listas para el motor, y pedirle que las analice.
 *
 * **Los tres pasos van en este orden por una razón concreta.** Una partida sin filas en `moves`
 * no se puede analizar; desde que el entrenador puede pedir cualquier partida, el analizador se
 * niega a reclamarla (ver `AnalysisStore.claimBatch`). Así que la extracción tiene que ocurrir
 * antes de pedir el análisis, o la partida queda esperando al cron del día siguiente.
 *
 * Los dos primeros pasos corren en Vercel (parseo de PGN, milisegundos por partida). El tercero no
 * puede: Stockfish necesita un binario nativo y minutos, así que se dispara `analyze.yml`.
 */
export async function traerPartidasNuevas(): Promise<void> {
  const store = new SupabaseIngestStore(supabaseAdmin());

  await runIngest({
    store,
    client: new ChesscomClient({ username: env.CHESSCOM_USERNAME }),
    username: env.CHESSCOM_USERNAME,
    environment: appEnv(),
    trigger: 'manual',
    scope: { kind: 'recent' },
  });

  // El límite es la diferencia entre un botón y un timeout: si algún día hay un atraso de miles de
  // partidas, esto igual termina en segundos y la cola la vacía el workflow.
  await runExtractMoves({ store, environment: appEnv(), trigger: 'manual', limite: 20 });

  // Que no haya `GITHUB_TOKEN` no puede romper el botón: la ingesta ya ocurrió, que es lo que el
  // jugador vino a buscar. El análisis se dispara igual cada día con el cron.
  try {
    await dispatchWorkflow('analyze.yml', { batch: '50' });
  } catch (error) {
    log.error('no se pudo disparar el analisis tras traer partidas', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  revalidatePath('/');
  revalidatePath('/entrenador/partidas');
}

/**
 * Pedirle al motor que analice UNA partida elegida, antes que la cola por clase.
 *
 * Sin esto, una partida de bala recién jugada queda detrás de miles de blitz pendientes (la cola
 * prioriza rápida, después blitz) y "analizar" analizaría otras cincuenta. El workflow le pasa el
 * id al analizador y al constructor de ejercicios, que la ponen primera.
 *
 * El lote es chico a propósito: lo que se quiere es ESTA partida pronto, no vaciar la cola.
 */
export async function analizarEstaPartida(gameId: number): Promise<void> {
  if (!Number.isInteger(gameId) || gameId <= 0) {
    redirect('/entrenador/partidas?error=' + encodeURIComponent('Partida inválida.'));
  }
  try {
    await dispatchWorkflow('analyze.yml', { batch: '10', partida: String(gameId) });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    redirect(`/entrenador/partidas?error=${encodeURIComponent(mensaje)}`);
  }
  revalidatePath('/entrenador/partidas');
  redirect(`/entrenador/partidas?pedida=${gameId}`);
}
