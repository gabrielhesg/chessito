'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * Agrupada por intencion, no por orden de construccion: primero lo que empuja a jugar, despues
 * el analisis, despues el entrenamiento, y al final el estado del sistema.
 *
 * Es componente de cliente por una sola razon: marcar la ruta activa necesita `usePathname`.
 * El resto de la app sigue siendo 100% Server Components.
 */
type NavItem = { href: string; label: string };
type Grupo = { titulo: string | null; items: NavItem[] };

const GRUPOS: Grupo[] = [
  { titulo: null, items: [{ href: '/', label: 'Portada' }] },
  {
    titulo: 'Analizar',
    items: [
      { href: '/aperturas', label: 'Aperturas' },
      { href: '/errores', label: 'Errores' },
      { href: '/ritmo', label: 'Ritmo' },
      { href: '/reloj', label: 'Reloj' },
      { href: '/registro', label: 'Partidas' },
    ],
  },
  { titulo: 'Entrenar', items: [{ href: '/entrenador', label: 'Entrenador' }] },
  { titulo: null, items: [{ href: '/salud', label: 'Salud' }] },
];

const TODOS = GRUPOS.flatMap((g) => g.items);

function esActiva(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname() ?? '/';
  const [abierto, setAbierto] = useState(false);
  const actual = TODOS.find((i) => esActiva(pathname, i.href));

  return (
    <>
      {/* Escritorio: todo a la vista, con separadores entre grupos. */}
      <nav className="hidden items-center gap-1 text-sm md:flex">
        {GRUPOS.map((grupo, i) => (
          <div key={grupo.titulo ?? i} className="flex items-center gap-1">
            {i > 0 ? <span aria-hidden className="mx-1 h-4 w-px bg-borde" /> : null}
            {grupo.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={esActiva(pathname, item.href) ? 'page' : undefined}
                className={`rounded-lg px-2.5 py-1.5 transition-colors ${
                  esActiva(pathname, item.href)
                    ? 'bg-panel-alto font-medium text-texto'
                    : 'text-tenue hover:bg-panel hover:text-texto'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* Celular: un boton que dice donde estas y despliega el resto. */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex items-center gap-2 rounded-lg border border-borde px-2.5 py-1.5 text-sm"
        >
          {actual?.label ?? 'Menú'}
          <span aria-hidden className="text-apagado">
            {abierto ? '▲' : '▼'}
          </span>
        </button>
        {abierto ? (
          <div className="absolute left-0 right-0 top-full z-30 border-b border-borde bg-panel px-4 py-2 shadow-flotante">
            {GRUPOS.map((grupo, i) => (
              <div key={grupo.titulo ?? i} className="py-1">
                {grupo.titulo ? (
                  <p className="px-2 pb-1 pt-2 text-2xs uppercase tracking-wider text-apagado">
                    {grupo.titulo}
                  </p>
                ) : null}
                {grupo.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setAbierto(false)}
                    aria-current={esActiva(pathname, item.href) ? 'page' : undefined}
                    className={`block rounded-lg px-2 py-2 text-sm ${
                      esActiva(pathname, item.href)
                        ? 'bg-panel-alto font-medium text-texto'
                        : 'text-tenue'
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
