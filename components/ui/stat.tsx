import type { ReactNode } from 'react';
import { pct } from './format';

/** Tile de KPI. El valor es el protagonista: grande, tabular, con el eyebrow mono arriba. */
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
  const color =
    tono === 'bien' ? 'text-bien' : tono === 'critico' ? 'text-critico' : tono === 'aviso' ? 'text-aviso' : '';
  return (
    <div className="rounded-xl border border-borde bg-panel px-4 py-3.5">
      <p className="eyebrow">{etiqueta}</p>
      <p className={`mt-1.5 text-[26px] font-semibold tracking-[-0.02em] tabular-nums ${color}`}>{valor}</p>
      {detalle ? <p className="mt-0.5 text-xs text-apagado">{detalle}</p> : null}
      {children ? <div className="mt-2.5">{children}</div> : null}
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
      <div className="font-mono text-[11px] tabular-nums text-apagado">
        {pct(pctValue)} bruto · n={n}
      </div>
    </div>
  );
}

/** Barra de progreso horizontal, reutilizable (la portada la tenia escrita a mano). */
export function Progreso({
  valor,
  tono = 'bien',
  alto = 'h-2',
}: {
  valor: number;
  tono?: 'bien' | 'acento' | 'critico' | 'aviso';
  alto?: string;
}) {
  const ancho = Math.max(0, Math.min(100, valor));
  const color =
    tono === 'bien' ? 'bg-bien' : tono === 'acento' ? 'bg-acento' : tono === 'critico' ? 'bg-critico' : 'bg-aviso';
  return (
    <div className={`${alto} w-full overflow-hidden rounded-full bg-borde`}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${ancho}%` }} aria-hidden />
    </div>
  );
}

/**
 * Fila de "metrica con barra": etiqueta a la izquierda, valor a la derecha, barra debajo.
 * Es el patron de los bloques "Estas mejorando" / "Esto no mejora" y de "en que patron
 * tropiezas mas", que en el mockup aparecen tres veces con la misma forma.
 */
export function FilaMetrica({
  etiqueta,
  valor,
  porcentaje,
  tono = 'bien',
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  porcentaje: number;
  tono?: 'bien' | 'critico' | 'aviso' | 'acento';
}) {
  const color =
    tono === 'bien' ? 'text-bien' : tono === 'critico' ? 'text-critico' : tono === 'aviso' ? 'text-aviso' : 'text-acento';
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="min-w-0 truncate">{etiqueta}</span>
        <span className={`shrink-0 font-mono ${color}`}>{valor}</span>
      </div>
      <div className="mt-1.5">
        <Progreso valor={porcentaje} tono={tono} alto="h-1.5" />
      </div>
    </li>
  );
}
