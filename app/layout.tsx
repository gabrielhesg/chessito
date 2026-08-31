import type { Metadata } from 'next';
import Link from 'next/link';
import { envLabel } from '@/lib/env';
import './globals.css';

export const metadata: Metadata = {
  title: 'Chessito',
  description: 'Analisis de mis partidas de chess.com',
};

const NAV = [
  { href: '/', label: 'Portada' },
  { href: '/aperturas', label: 'Aperturas' },
  { href: '/ritmo', label: 'Ritmo' },
  { href: '/registro', label: 'Registro' },
  { href: '/salud', label: 'Salud' },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Etiqueta visible cuando NO es produccion: un preview identico a produccion es la receta
  // para tomar decisiones sobre datos equivocados (docs/ENVIRONMENTS.md).
  const label = envLabel();

  return (
    <html lang="es">
      <body className="min-h-screen bg-[var(--color-fondo)] text-[var(--color-texto)] antialiased">
        <header className="border-b border-[var(--color-borde)]">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <span className="font-semibold tracking-tight">Chessito</span>
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-[var(--color-tenue)] hover:text-[var(--color-texto)]">
                  {item.label}
                </Link>
              ))}
            </nav>
            {label ? (
              <span className="ml-auto rounded border border-[var(--color-aviso)] px-2 py-0.5 text-xs font-medium text-[var(--color-aviso)]">
                {label}
              </span>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
