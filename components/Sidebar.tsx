'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * Barra lateral de 216px, agrupada por intencion: primero lo que empuja a jugar, despues el
 * analisis, despues el entrenamiento, y al final el estado del sistema.
 *
 * Es componente de cliente por una sola razon: marcar la ruta activa necesita `usePathname`.
 * El resto de la app sigue siendo Server Components.
 *
 * `insignia` es un conteo que viene del servidor (ejercicios vencidos, chequeos fallando). Se
 * pasa como prop en vez de consultarlo aca: un componente de cliente no lee la base.
 */
type NavItem = { href: string; label: string; insignia?: number | null; tonoInsignia?: 'acento' | 'tenue' };
type Grupo = { titulo: string | null; items: NavItem[] };

function esActiva(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  ejerciciosVencidos,
  chequeosFallando,
  usuario,
  subtitulo,
}: {
  ejerciciosVencidos: number;
  chequeosFallando: number;
  usuario: string;
  subtitulo: string;
}) {
  const pathname = usePathname() ?? '/';
  const [abierto, setAbierto] = useState(false);

  const grupos: Grupo[] = [
    { titulo: null, items: [{ href: '/', label: 'Hoy' }] },
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
    {
      titulo: 'Entrenar',
      items: [
        {
          href: '/entrenador',
          label: 'Entrenador',
          insignia: ejerciciosVencidos || null,
          tonoInsignia: ejerciciosVencidos > 0 ? 'acento' : 'tenue',
        },
      ],
    },
  ];

  const todos = grupos.flatMap((g) => g.items);
  const actual = todos.find((i) => esActiva(pathname, i.href));

  const enlace = (item: NavItem, cerrar?: () => void) => {
    const activa = esActiva(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={cerrar}
        aria-current={activa ? 'page' : undefined}
        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors ${
          activa ? 'bg-panel-alto font-medium text-texto' : 'text-tenue hover:bg-panel-alto/60 hover:text-texto'
        }`}
      >
        {item.label}
        {item.insignia ? (
          <span
            className={`font-mono text-[11px] font-medium ${
              item.tonoInsignia === 'acento' ? 'text-acento' : 'text-tenue'
            }`}
          >
            {item.insignia}
          </span>
        ) : null}
      </Link>
    );
  };

  const marca = (
    <Link href="/" className="flex items-center gap-2.5 px-1.5">
      <span
        aria-hidden
        className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-acento text-base leading-none text-fondo"
      >
        ♞
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Chessito</span>
    </Link>
  );

  const pie = (
    <div className="mt-auto flex flex-col gap-2.5">
      <Link
        href="/salud"
        aria-current={esActiva(pathname, '/salud') ? 'page' : undefined}
        className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors ${
          esActiva(pathname, '/salud') ? 'bg-panel-alto text-texto' : 'text-tenue hover:text-texto'
        }`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${chequeosFallando > 0 ? 'bg-critico' : 'bg-bien'}`}
        />
        Salud del sistema
      </Link>
      <div className="flex items-center gap-2.5 rounded-[9px] border border-borde px-2.5 py-2">
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-borde font-mono text-[11px] font-medium text-tenue">
          {usuario.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium">{usuario}</p>
          <p className="truncate font-mono text-[10.5px] text-apagado">{subtitulo}</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Escritorio: barra fija de 216px. */}
      <aside className="hidden w-[216px] shrink-0 flex-col gap-6 border-r border-borde bg-lateral px-3.5 py-4.5 text-sm md:flex">
        {marca}
        <nav className="flex flex-col gap-4.5">
          {grupos.map((grupo, i) => (
            <div key={grupo.titulo ?? i} className="flex flex-col gap-0.5">
              {grupo.titulo ? <p className="eyebrow mb-1 px-2.5 text-apagado">{grupo.titulo}</p> : null}
              {grupo.items.map((item) => enlace(item))}
            </div>
          ))}
        </nav>
        {pie}
      </aside>

      {/* Celular: cabecera con el nombre de la seccion, que despliega el resto. */}
      <div className="border-b border-borde bg-lateral md:hidden">
        <div className="flex items-center justify-between px-4 py-2.5">
          {marca}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="flex items-center gap-2 rounded-lg border border-borde px-2.5 py-1.5 text-sm text-tenue"
          >
            {actual?.label ?? 'Menú'}
            <span aria-hidden className="text-apagado">
              {abierto ? '▲' : '▼'}
            </span>
          </button>
        </div>
        {abierto ? (
          <div className="border-t border-borde px-4 pb-3 text-sm">
            {grupos.map((grupo, i) => (
              <div key={grupo.titulo ?? i} className="flex flex-col gap-0.5 py-1">
                {grupo.titulo ? <p className="eyebrow mb-1 px-2.5 pt-2">{grupo.titulo}</p> : null}
                {grupo.items.map((item) => enlace(item, () => setAbierto(false)))}
              </div>
            ))}
            <div className="pt-1">{enlace({ href: '/salud', label: 'Salud del sistema' }, () => setAbierto(false))}</div>
          </div>
        ) : null}
      </div>
    </>
  );
}
