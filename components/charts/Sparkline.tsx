import { caminoLinea } from '@/lib/charts/path';
import { escalaLineal } from '@/lib/charts/scale';

/**
 * Linea minima, sin ejes ni marcas: acompana a un numero grande para dar la tendencia. Es SVG
 * porque es geometria de verdad (a diferencia de las barras, que en HTML salen mejor).
 *
 * `preserveAspectRatio="none"` mas `w-full` hacen que se estire al ancho del contenedor: el eje
 * x de una tendencia no necesita escala fiel, solo orden.
 */
export function Sparkline({
  valores,
  alto = 28,
  tono = 'acento',
  area = false,
}: {
  valores: readonly number[];
  alto?: number;
  tono?: 'acento' | 'bien' | 'critico';
  /** Rellena bajo la linea con un degradado del mismo tono. */
  area?: boolean;
}) {
  const limpios = valores.filter((v) => Number.isFinite(v));
  if (limpios.length < 2) return null;

  const ANCHO = 100;
  const margen = 2;
  const min = Math.min(...limpios);
  const max = Math.max(...limpios);
  const x = escalaLineal([0, limpios.length - 1], [0, ANCHO]);
  const y = escalaLineal([min, max], [alto - margen, margen]);
  const puntos = limpios.map((v, i) => ({ x: x(i), y: y(v) }));
  const d = caminoLinea(puntos);
  // El area se cierra contra el borde inferior del viewBox, no contra el minimo: asi el relleno
  // apoya en el piso de la caja y no deja una franja flotando.
  const dArea = `${d} L ${ANCHO} ${alto} L 0 ${alto} Z`;
  const idGrad = `spark-${tono}-${alto}`;

  const color =
    tono === 'bien' ? 'var(--color-bien)' : tono === 'critico' ? 'var(--color-critico)' : 'var(--color-acento)';

  return (
    <svg
      viewBox={`0 0 ${ANCHO} ${alto}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: alto }}
      role="img"
      aria-label={`Tendencia de ${limpios.length} puntos, de ${limpios[0]} a ${limpios[limpios.length - 1]}`}
    >
      {area ? (
        <>
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={dArea} fill={`url(#${idGrad})`} stroke="none" />
        </>
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
