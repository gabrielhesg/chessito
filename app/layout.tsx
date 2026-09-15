import type { Metadata } from 'next';
import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { envLabel } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chessito',
  description: 'Analisis de mis partidas de chess.com',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Etiqueta visible cuando NO es produccion: un preview identico a produccion es la receta
  // para tomar decisiones sobre datos equivocados (docs/ENVIRONMENTS.md).
  const label = envLabel();

  return (
    <html lang="es">
      <body className="min-h-screen bg-fondo font-sans text-texto antialiased">
        <header className="sticky top-0 z-20 border-b border-borde bg-fondo/85 backdrop-blur">
          <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <span aria-hidden className="text-lg leading-none">
                ♞
              </span>
              <span className="font-semibold tracking-tight">Chessito</span>
            </Link>
            <Nav />
            {label ? (
              <span className="ml-auto rounded-md border border-aviso/40 bg-aviso/10 px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-aviso">
                {label}
              </span>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
