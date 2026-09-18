import type { GameRow } from '@/lib/chess/game';

/**
 * Quita del upsert las columnas que describen el ESTADO del analisis, no la partida.
 *
 * Vive en su propio modulo, sin `server-only`, para que se pueda probar: `supabase-store.ts`
 * arrastra el cliente de Supabase y con el la marca de servidor, y un test no puede importarlo.
 *
 * Van por nombre y no desestructurando para que agregar una columna de estado nueva sea editar
 * esta funcion, que es donde alguien la va a buscar.
 */
export function sinColumnasDeEstado(fila: GameRow): Omit<GameRow, 'analysis_state' | 'skip_reason'> {
  const copia: Partial<GameRow> = { ...fila };
  delete copia.analysis_state;
  delete copia.skip_reason;
  return copia as Omit<GameRow, 'analysis_state' | 'skip_reason'>;
}
