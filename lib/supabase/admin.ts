import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Cliente con la service role key: salta RLS y es el unico que puede leer y escribir.
 * `import 'server-only'` en la primera linea hace que el build FALLE si alguien lo importa
 * desde un componente cliente. Ver docs/ENGINEERING.md seccion 9.
 */
export type AdminClient = SupabaseClient<Database>;

let cached: AdminClient | null = null;

export function supabaseAdmin(): AdminClient {
  if (cached) return cached;
  cached = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
