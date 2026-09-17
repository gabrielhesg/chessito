'use server';

/**
 * La escritura de la revision de una partida. Mismo transporte que `recordAttempt`
 * (`supabaseAdmin()`, PostgREST + service role): corre en Vercel por un click, no es un script
 * batch, asi que no aplica la regla de conexion directa a Postgres.
 *
 * Todo el archivo lleva `'use server'` para poder importarla desde un componente cliente, que es
 * quien la va a llamar cuando F2-02 arme el modo ciego.
 */
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { ReviewMotivo } from '@/lib/data';

export type Revision = {
  gameId: number;
  /**
   * El ply donde el alumno cree que se perdio la partida. `null` cuando uso el boton de escape:
   * saltarse el ritual tambien cuenta como revisada, porque la alternativa es una cola que
   * crece para siempre y deja de mirarse.
   */
  plyMarcado: number | null;
  motivo: ReviewMotivo | null;
  /** Lo que no cabe en la lista cerrada. Siempre opcional, nunca en lugar del motivo. */
  nota?: string | null;
  /**
   * El ply que senala el motor, congelado al momento de revisar. Se guarda en vez de derivarse
   * despues porque el analisis se puede re-correr con otra version de Stockfish: la comparacion
   * tiene que ser contra lo que el alumno vio, no contra lo que el motor diga manana.
   */
  plyDelMotor: number | null;
};

/**
 * Guarda la revision. `upsert` sobre `game_id` (que es la clave primaria): revisar de nuevo pisa
 * la fila anterior en vez de acumular, porque lo que interesa es el estado "revisada".
 *
 * A diferencia de `recordAttempt`, esta escritura SI es critica: si falla en silencio, la
 * derrota vuelve a aparecer en la portada como pendiente y el alumno la revisa de nuevo. Por eso
 * lanza en vez de solo loguear.
 */
export async function guardarRevision(revision: Revision): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('game_reviews')
    .upsert(
      {
        game_id: revision.gameId,
        ply_marcado: revision.plyMarcado,
        motivo: revision.motivo,
        nota: revision.nota ?? null,
        ply_del_motor: revision.plyDelMotor,
      },
      { onConflict: 'game_id' },
    );
  if (error) throw new Error(`No se pudo guardar la revisión de la partida ${revision.gameId}: ${error.message}`);

  // La portada y el registro muestran la cola: sin esto, la tarea de hoy seguiria diciendo que
  // la derrota esta pendiente hasta que el cache se venza solo.
  revalidatePath('/');
  revalidatePath('/registro');
  revalidatePath(`/partida/${revision.gameId}`);
}
