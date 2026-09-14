import type { ReactNode } from 'react';
import { pct } from './format';

/** Tile de KPI. El valor es el protagonista: grande, con la etiqueta chica arriba. */
export function Stat({
  etiqueta,
  valor,
  detalle,
  tono,
  children,
}: {
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: 'bien' | 'critico' | 'aviso';
  /** Espacio para un sparkline o una barra de progreso. */
  children?: ReactNode;
}) {
  const color = tono === 'bien' ? 'text-bien' : tono === 'critico' ? 'text-critico' : tono === 'aviso' ? 'text-aviso' : '';
  return (
    <div className="rounded-xl border border-borde bg-panel px-4 py-3 shadow-panel">
      <p className="text-2xs uppercase tracking-wider text-tenue">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${color}`}>{valor}</p>
      {detalle ? <p className="mt-0.5 text-xs text-tenue">{detalle}</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

/**
 * Celda de rendimiento: el numero grande es la cota inferior de Wilson (la que ordena y la que
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
    <div className="text-right">
      <div className="tabular-nums">{pct(wilson)}</div>
      <div className="text-2xs tabular-nums text-tenue">
        {pct(pctValue)} bruto · n={n}
      </div>
    </div>
  );
}

/** Barra de progreso horizontal, reutilizable (la portada la tenia escrita a mano). */
export function Progreso({ valor, tono = 'bien' }: { valor: number; tono?: 'bien' | 'acento' }) {
  const ancho = Math.max(0, Math.min(100, valor));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-borde">
      <div
        className={`h-full rounded-full ${tono === 'bien' ? 'bg-bien' : 'bg-acento'}`}
        style={{ width: `${ancho}%` }}
        aria-hidden
      />
    </div>
  );
}
