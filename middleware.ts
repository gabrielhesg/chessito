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

  // Se aceptan los nombres con prefijo como respaldo; ver la nota en lib/env.ts.
  const url = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anonKey = process.env['SUPABASE_ANON_KEY'] ?? process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const ownerEmail = process.env['OWNER_EMAIL'];
  if (!url || !anonKey || !ownerEmail) {
    return new NextResponse('Faltan SUPABASE_URL, SUPABASE_ANON_KEY u OWNER_EMAIL en las variables de entorno', { status: 500 });
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

  // Supabase manda el link del correo de signInWithOtp de vuelta a `Site URL` con `?code=...`
  // (flujo PKCE), no con el token de 6 digitos: la plantilla de correo por omision no expone
  // `{{ .Token }}` en texto y cambiarla pide SMTP propio. En vez de depender de la plantilla,
  // el propio middleware canjea el code por una sesion si lo encuentra, así clickear el link
  // del correo entra igual que escribir el codigo en /entrar (verificarCodigo sigue existiendo
  // como respaldo, por si el link no llega o vence).
  const code = request.nextUrl.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/entrar?error=${encodeURIComponent(error.message)}`, request.url));
    }
    const clean = new URL(request.nextUrl.pathname, request.url);
    response.headers.set('location', clean.toString());
    return new NextResponse(null, { status: 307, headers: response.headers });
  }

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
     *  - /stockfish        el motor WASM que carga el Web Worker del analisis interactivo.
     *                      Sin esta excepcion el worker recibe el HTML de /entrar en vez del
     *                      motor y falla con un error que no dice nada. Es un binario publico
     *                      GPL, no hay nada que proteger.
     *  - estaticos de Next y el favicon
     *
     * Cualquier otra ruta nueva nace DENTRO del gate. El flujo OTP se resuelve con server
     * actions en /entrar, que el propio middleware deja pasar sin sesion.
     */
    '/((?!api/ingest|stockfish|_next/static|_next/image|favicon.ico).*)',
  ],
};
