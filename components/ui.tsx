import type { ReactNode } from 'react';

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

/** Muestra `n` siempre, y atenua la fila cuando la muestra es chica. */
export function Muestra({ n }: { n: number }) {
  const chica = n < N_MINIMO;
  return (
    <span className={chica ? 'text-[var(--color-tenue)]' : ''} title={chica ? `Muestra chica: ${n} < ${N_MINIMO}` : undefined}>
      n={n}
      {chica ? ' ·' : ''}
    </span>
  );
}

export function filaAtenuada(n: number): string {
  return n < N_MINIMO ? 'opacity-45' : '';
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

export function Tabla({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-borde)] text-left text-xs uppercase tracking-wide text-[var(--color-tenue)]">
            {headers.map((h) => (
              <th key={h} className="py-2 pr-3 font-medium">
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
