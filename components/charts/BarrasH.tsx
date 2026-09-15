import type { ReactNode } from 'react';

export type BarraH = {
  /** Etiqueta de la fila. */
  etiqueta: ReactNode;
  /** Valor que define el largo de la barra, en las mismas unidades que `max`. */
  valor: number;
  /** Texto que se muestra en la columna de valor. Si falta, se muestra `valor`. */
  texto?: string;
  /** Segunda marca fina sobre la misma barra (ej: el porcentaje bruto sobre la cota de Wilson). */
  referencia?: number;
  /** Atenua la fila entera: muestra chica, sin recomendacion asociada. */
  atenuada?: boolean;
  /** Detalle para el tooltip nativo del navegador. */
  titulo?: string;
};

/**
 * Barras horizontales en HTML, no SVG: las etiquetas de texto, el ajuste responsive y el hover
 * salen gratis, y el resultado es accesible sin trabajo extra. El SVG se reserva para lineas y
 * areas (`Sparkline`, `EvalChart`), donde la geometria si lo justifica.
 *
 * Tres columnas fijas — etiqueta | pista de la barra | valor — para que el numero NUNCA se
 * superponga con el final de la barra ni con la linea de referencia.
 *
 * Un solo color para toda la serie, a proposito. Pintar cada barra segun si su valor es alto o
 * bajo es colorear por ranking, y eso hace que el mismo dato cambie de color cuando cambia el
 * filtro; la comparacion la hace el largo de la barra y la linea de referencia, que es lo que
 * el ojo lee mejor. Los colores de estado quedan reservados para estados de verdad
 * (clasificacion de una jugada, chequeo en rojo), donde ademas siempre hay texto.
 */
export function BarrasH({
  datos,
  max,
  /** Linea vertical de referencia (ej: 50% en rendimiento). En las mismas unidades que `max`. */
  referencia,
  etiquetaReferencia,
  anchoEtiqueta = 'w-2/5',
}: {
  datos: readonly BarraH[];
  max: number;
  referencia?: number;
  etiquetaReferencia?: string;
  anchoEtiqueta?: string;
}) {
  const tope = max > 0 ? max : 1;
  const posRef = referencia === undefined ? null : Math.max(0, Math.min(100, (referencia / tope) * 100));

  return (
    <div>
      {etiquetaReferencia && posRef !== null ? (
        <div className="mb-1 flex items-center gap-3">
          <span className={`${anchoEtiqueta} shrink-0`} />
          <span className="relative h-3 flex-1">
            <span
              className="absolute -translate-x-1/2 text-2xs text-apagado"
              style={{ left: `${posRef}%` }}
            >
              {etiquetaReferencia}
            </span>
          </span>
          <span className="w-12 shrink-0" />
        </div>
      ) : null}

      <ul className="space-y-1">
        {datos.map((d, i) => (
          <li
            key={i}
            className={`flex items-center gap-3 ${d.atenuada ? 'opacity-45' : ''}`}
            title={d.titulo}
          >
            <span
              className={`${anchoEtiqueta} shrink-0 truncate text-xs`}
              title={typeof d.etiqueta === 'string' ? d.etiqueta : undefined}
            >
              {d.etiqueta}
            </span>

            <span className="relative h-5 flex-1">
              {posRef !== null ? (
                <span
                  className="absolute inset-y-0 border-l border-dashed border-borde-fuerte"
                  style={{ left: `${posRef}%` }}
                  aria-hidden
                />
              ) : null}
              <span
                className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-r-full bg-acento"
                style={{ width: `${Math.max(0, Math.min(100, (d.valor / tope) * 100))}%` }}
              />
              {d.referencia !== undefined ? (
                <span
                  className="absolute top-1/2 h-3.5 w-px -translate-y-1/2 bg-texto/70"
                  style={{ left: `${Math.max(0, Math.min(100, (d.referencia / tope) * 100))}%` }}
                  aria-hidden
                />
              ) : null}
            </span>

            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-tenue">
              {d.texto ?? d.valor}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
