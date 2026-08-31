/**
 * Contexto comun de los scripts batch: variables de entorno validadas al arrancar y el store
 * de datos que corresponda.
 *
 * Los scripts prefieren la conexion directa (`SUPABASE_DB_URL`) porque mueven miles de filas;
 * si no esta, caen a PostgREST con la service role key, que es lo que usa la app.
 */
import { config } from 'dotenv';
import { assertEnv, appEnv } from '@/lib/env';
import { PgIngestStore } from '@/lib/ingest/pg-store';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { IngestStore } from '@/lib/ingest/store';

config({ path: '.env.local', quiet: true });

export type BatchContext = {
  store: IngestStore;
  username: string;
  environment: string;
  trigger: string;
};

export function batchContext(): BatchContext {
  const env = assertEnv();
  // `GITHUB_ACTIONS` la inyecta el runner y sirve solo para etiquetar `job_runs.trigger`.
  // No es configuracion: si falta, la corrida simplemente queda como 'manual'.
  const trigger = process.env['GITHUB_ACTIONS'] === 'true' ? 'workflow_dispatch' : 'manual';
  const store: IngestStore = env.SUPABASE_DB_URL
    ? new PgIngestStore(env.SUPABASE_DB_URL)
    : new SupabaseIngestStore(supabaseAdmin());

  return { store, username: env.CHESSCOM_USERNAME, environment: appEnv(), trigger };
}

/** Termina el proceso con codigo 1 y un mensaje legible, sin volcar el stack completo. */
export function die(error: unknown): never {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
