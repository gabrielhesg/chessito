import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from '@/lib/database.types';

/**
 * Cliente con la sesion del usuario (anon key). Solo se usa para autenticacion: los datos
 * los lee siempre el cliente admin, porque RLS esta activo y sin politicas.
 */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        },
      },
    },
  );
}
