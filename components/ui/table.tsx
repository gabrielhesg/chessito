import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Encabezado de columna ordenable: es un `<Link>`, no un boton de cliente. `href` recibe la
 * proxima direccion de orden y arma la URL completa: cambia `searchParams` y Next re-renderiza
 * el Server Component con el nuevo orden, sin JS de cliente.
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
    <Link
      href={href(sortKey, proximaDir)}
      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 -mx-1 transition-colors hover:text-texto ${
        activa ? 'text-texto' : ''
      }`}
    >
      {label}
      <span className={activa ? 'text-acento' : 'text-apagado'}>{flecha}</span>
    </Link>
  );
}

/** Celda de datos. `num` alinea a la derecha y usa cifras tabulares, que es lo que hace legible
 *  una columna de numeros; antes cada pagina repetia estas clases a mano. */
export function Td({
  children,
  num = false,
  className = '',
  colSpan,
}: {
  children?: ReactNode;
  num?: boolean;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`px-3 py-2 align-middle ${num ? 'text-right tabular-nums' : ''} ${className}`}
    >
      {children}
    </td>
  );
}

export function Fila({
  children,
  atenuada = false,
  className = '',
}: {
  children: ReactNode;
  atenuada?: boolean;
  className?: string;
}) {
  return (
    <tr
      className={`border-b border-borde/60 transition-colors last:border-0 hover:bg-panel-alto ${
        atenuada ? 'opacity-45' : ''
      } ${className}`}
    >
      {children}
    </tr>
  );
}

export function Tabla({
  headers,
  aligns,
  children,
}: {
  headers: ReactNode[];
  /** 'num' alinea ese encabezado a la derecha, para que calce con las celdas numericas. */
  aligns?: ReadonlyArray<'text' | 'num'>;
  children: ReactNode;
}) {
  return (
    // `overflow-x-auto` sin margen negativo: con `-mx-4` el contenedor queda mas ancho que el
    // panel y el desborde se lo come la pagina entera, que es justo lo que no puede pasar.
    // Solo la tabla scrollea; el cuerpo nunca.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borde text-left text-2xs uppercase tracking-wider text-tenue">
            {headers.map((h, i) => (
              <th
                key={i}
                className={`px-3 py-2 font-medium ${aligns?.[i] === 'num' ? 'text-right' : ''}`}
              >
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
