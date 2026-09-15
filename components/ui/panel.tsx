import type { ReactNode } from 'react';

export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  /** Controles alineados a la derecha del titulo (filtros, links, botones). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    // `min-w-0` no es decorativo: un item de grid o flex tiene `min-width: auto`, asi que un
    // panel con una tabla ancha adentro CRECE en vez de dejarla scrollear, y termina empujando
    // el ancho de la pagina entera en celular.
    <section className="min-w-0 rounded-xl border border-borde bg-panel shadow-panel">
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borde px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-tenue">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-tenue">{children}</p>;
}

/** Estado vacio con salida: un vacio sin accion deja al usuario sin saber que hacer. */
export function EmptyState({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <p className="text-sm font-medium">{titulo}</p>
      {detalle ? <p className="max-w-sm text-xs text-tenue">{detalle}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-borde ${className}`} />;
}

/** Encabezado de pagina, para que las nueve paginas dejen de repetir el mismo bloque. */
export function PageHeader({
  titulo,
  children,
  actions,
}: {
  titulo: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {children ? <div className="mt-1 max-w-2xl text-sm text-tenue">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
