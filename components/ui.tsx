import type { ReactNode } from 'react';
import Link from 'next/link';

/** Umbral del proyecto: bajo 20 partidas un corte es ruido y no lleva recomendacion. */
export const N_MINIMO = 20;

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-panel)] p-4">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {subtitle ? <p className="mt-0.5 text-xs text-[var(--color-tenue)]">{subtitle}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--color-tenue)]">{children}</p>;
}

export function filaAtenuada(n: number): string {
  return n < N_MINIMO ? 'opacity-45' : '';
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Celda de rendimiento colapsada: el numero grande es la cota de Wilson (el que ordena y el que
 * importa para decidir), con el porcentaje bruto y el tamano de muestra chicos debajo. Evita que
 * "Wilson" y "n" sean columnas sueltas que el usuario no sabe relacionar.
 */
export function Rendimiento({
  pctValue,
  wilson,
  n,
}: {
  pctValue: number | null | undefined;
  wilson: number | null | undefined;
  n: number;
}) {
  return (
    <div>
      <div className="tabular-nums">{pct(wilson)}</div>
      <div className="text-xs tabular-nums text-[var(--color-tenue)]">
        {pct(pctValue)} bruto · n={n}
      </div>
    </div>
  );
}

/**
 * Tooltip real: un icono "?" con `<details>/<summary>`, sin JS ni `useState`. A diferencia de
 * `title=`, se abre con tap en celular (no solo con hover de mouse).
 */
export function Ayuda({ children }: { children: ReactNode }) {
  return (
    <details className="relative inline-block align-middle">
      <summary className="ml-1 inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--color-tenue)] text-[10px] leading-none text-[var(--color-tenue)] [&::-webkit-details-marker]:hidden">
        ?
      </summary>
      <div className="absolute left-0 top-5 z-10 w-56 rounded border border-[var(--color-borde)] bg-[var(--color-panel)] p-2 text-xs font-normal normal-case tracking-normal text-[var(--color-texto)] shadow-lg">
        {children}
      </div>
    </details>
  );
}

/**
 * Encabezado de columna ordenable: es un `<Link>`, no un boton de cliente. `href` recibe la
 * proxima direccion de orden y arma la URL completa (mismo patron que `Filtro` en /registro):
 * cambia `searchParams` y Next re-renderiza el Server Component con el nuevo orden.
 */
export function SortableTh({
  label,
  sortKey,
  currentSort,
  currentDir,
  href,
}: {
  label: string;
  sortKey: string;
  currentSort?: string;
  currentDir?: 'asc' | 'desc';
  href: (sortKey: string, dir: 'asc' | 'desc') => string;
}) {
  const activa = currentSort === sortKey;
  const proximaDir: 'asc' | 'desc' = activa && currentDir === 'asc' ? 'desc' : 'asc';
  const flecha = activa ? (currentDir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <Link href={href(sortKey, proximaDir)} className="inline-flex items-center gap-1 hover:text-[var(--color-texto)]">
      {label}
      <span className={activa ? '' : 'text-[var(--color-tenue)]/70'}>{flecha}</span>
    </Link>
  );
}

export function Tabla({ headers, children }: { headers: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-[var(--color-tenue)]">
            {headers.map((h, i) => (
              <th key={i} className="py-2 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Semaforo({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={ok ? 'text-[var(--color-bien)]' : 'text-[var(--color-mal)]'}>
      {ok ? '● ' : '● '}
      {children}
    </span>
  );
}
