import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Sidebar } from '@/components/Sidebar';
import { dueCount, healthSummary } from '@/lib/data';
import { env, envLabel } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chessito',
  description: 'Analisis de mis partidas de chess.com',
};

/**
 * El layout consulta la base para las insignias de la barra lateral (ejercicios vencidos,
 * chequeos fallando). Es una lectura barata y las paginas ya son `force-dynamic`, asi que no
 * agrega trabajo real; a cambio, el conteo de lo que falta esta siempre a la vista.
 *
 * Si la base todavia no responde (primer arranque, migraciones sin aplicar) la barra se dibuja
 * igual con los conteos en cero: la navegacion no puede depender de que la base este lista.
 *
 * El nombre de usuario entra en el MISMO try/catch, y no es cosmetico: `next build` prerrenderiza
 * `/_not-found`, que pasa por este layout, y en CI no hay secretos — leer `env.CHESSCOM_USERNAME`
 * suelto tumbaba el build entero con "Variables de entorno invalidas o ausentes". Es la razon por
 * la que `lib/env.ts` valida perezosamente, y el layout tiene que respetarla.
 */
async function insignias(): Promise<{ vencidos: number; fallando: number; usuario: string }> {
  try {
    const [vencidos, salud] = await Promise.all([dueCount(), healthSummary()]);
    return { vencidos, fallando: salud?.checks_failing ?? 0, usuario: env.CHESSCOM_USERNAME };
  } catch {
    return { vencidos: 0, fallando: 0, usuario: '' };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Etiqueta visible cuando NO es produccion: un preview identico a produccion es la receta
  // para tomar decisiones sobre datos equivocados (docs/ENVIRONMENTS.md).
  const label = envLabel();
  const { vencidos, fallando, usuario } = await insignias();

  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-fondo font-sans text-texto antialiased">
        <div className="flex min-h-screen flex-col md:flex-row">
          <Sidebar
            ejerciciosVencidos={vencidos}
            chequeosFallando={fallando}
            usuario={usuario}
            subtitulo="chess.com"
          />
          <div className="min-w-0 flex-1">
            {label ? (
              <p className="border-b border-aviso/30 bg-aviso/10 px-7 py-1.5 text-center font-mono text-2xs font-medium uppercase tracking-wider text-aviso">
                {label}
              </p>
            ) : null}
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
