import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Gate de un solo usuario: solo entra `OWNER_EMAIL`, con sesion de Supabase.
 *
 * El `matcher` EXCLUYE `/api/ingest`, que la llaman el cron de Vercel y GitHub Actions con un
 * bearer y no con una sesion. Si el middleware la tomara, el cron quedaria afuera y la app
 * dejaria de actualizarse en silencio.
 *
 * Este archivo lee `process.env` directamente y es la unica excepcion a la regla de `lib/env.ts`:
 * el middleware corre en el runtime edge de Next, donde `server-only` no se puede importar.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const ownerEmail = process.env['OWNER_EMAIL'];
  if (!url || !anonKey || !ownerEmail) {
    return new NextResponse('Faltan variables de entorno de Supabase o OWNER_EMAIL', { status: 500 });
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLogin = request.nextUrl.pathname.startsWith('/entrar');

  if (!user) {
    if (isLogin) return response;
    const login = new URL('/entrar', request.url);
    return NextResponse.redirect(login);
  }

  if (user.email?.toLowerCase() !== ownerEmail.toLowerCase()) {
    await supabase.auth.signOut();
    return new NextResponse('Esta app es de un solo usuario.', { status: 403 });
  }

  if (isLogin) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos:
     *  - /api/ingest       la llama el cron con un bearer, NUNCA con sesion
     *  - /api/auth/*       el intercambio del codigo OTP
     *  - estaticos de Next y el favicon
     */
    '/((?!api/ingest|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
