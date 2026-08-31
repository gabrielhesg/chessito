import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Acceso con codigo por email (OTP). Los signups estan deshabilitados en Supabase, asi que
 * solo entra un usuario que ya exista: hay que crearlo a mano en Authentication > Users.
 */
export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string; error?: string }>;
}) {
  const params = await searchParams;

  async function enviarCodigo(formData: FormData): Promise<void> {
    'use server';
    const raw = formData.get('email');
    const email = (typeof raw === 'string' ? raw : '').trim();
    if (email.toLowerCase() !== env.OWNER_EMAIL.toLowerCase()) {
      redirect('/entrar?error=Esta+app+es+de+un+solo+usuario');
    }
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      redirect(`/entrar?error=${encodeURIComponent(error.message)}`);
    }
    redirect('/entrar?enviado=1');
  }

  async function verificarCodigo(formData: FormData): Promise<void> {
    'use server';
    const raw = formData.get('token');
    const token = (typeof raw === 'string' ? raw : '').trim();
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      email: env.OWNER_EMAIL,
      token,
      type: 'email',
    });
    if (error) {
      redirect(`/entrar?enviado=1&error=${encodeURIComponent(error.message)}`);
    }
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-xl font-semibold">Entrar</h1>

      {params.error ? (
        <p className="rounded border border-[var(--color-mal)] px-3 py-2 text-sm text-[var(--color-mal)]">
          {params.error}
        </p>
      ) : null}

      {params.enviado ? (
        <form action={verificarCodigo} className="space-y-3">
          <p className="text-sm text-[var(--color-tenue)]">
            Te mandamos un codigo. Escribelo aca.
          </p>
          <input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className="w-full rounded border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-2"
            placeholder="123456"
          />
          <button type="submit" className="w-full rounded bg-[var(--color-texto)] px-3 py-2 font-medium text-[var(--color-fondo)]">
            Verificar
          </button>
        </form>
      ) : (
        <form action={enviarCodigo} className="space-y-3">
          <input
            name="email"
            type="email"
            required
            className="w-full rounded border border-[var(--color-borde)] bg-[var(--color-panel)] px-3 py-2"
            placeholder="tu@email.com"
          />
          <button type="submit" className="w-full rounded bg-[var(--color-texto)] px-3 py-2 font-medium text-[var(--color-fondo)]">
            Mandarme el codigo
          </button>
        </form>
      )}
    </div>
  );
}
