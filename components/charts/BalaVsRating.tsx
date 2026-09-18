import { escalaLineal } from '@/lib/charts/scale';
import { caminoLinea } from '@/lib/charts/path';

export type MesBalaRating = {
  /** `YYYY-MM` local. */
  mes: string;
  /** Partidas de bala ese mes. Va como barra. */
  bala: number;
  /** Rating de rápida al cierre del mes. Va como línea. Null cuando no jugó rápida. */
  rating: number | null;
};

/**
 * Las dos series que la revisión cruzada identificó como "la conversación con el alumno": el
 * volumen de bala contra el rating de rápida, en el mismo eje temporal.
 *
 * Dos ejes distintos en un gráfico normalmente es una mala idea, porque deja elegir la escala
 * hasta que las curvas digan lo que uno quiere. Acá se justifica porque **las unidades no se
 * comparan entre sí**: no se está diciendo "esta línea vale más que esta barra", se está
 * poniendo dos hechos sobre el mismo tiempo para que el alumno vea cuándo pasaron. La lectura la
 * hace él, y el pie del gráfico dice explícitamente que es correlación y no causa.
 *
 * Una serie, un color (regla de la Fase 6): el bala siempre del mismo tono, el rating también.
 * Ninguna barra cambia de color según su valor.
 */
export function BalaVsRating({ meses }: { meses: readonly MesBalaRating[] }) {
  if (meses.length < 3) return null;

  const ancho = 100;
  const alto = 42;
  const base = alto - 6;

  const maxBala = Math.max(1, ...meses.map((m) => m.bala));
  const escalaBala = escalaLineal([0, maxBala], [base, 4]);

  const conRating = meses.filter((m) => m.rating !== null);
  const minRating = Math.min(...conRating.map((m) => m.rating as number));
  const maxRating = Math.max(...conRating.map((m) => m.rating as number));
  // Un poco de aire arriba y abajo: sin eso el máximo toca el borde y no se lee como pico.
  const escalaRating = escalaLineal([minRating - 20, maxRating + 20], [base, 4]);

  const paso = ancho / meses.length;
  const anchoBarra = Math.max(1.2, paso * 0.55);

  const puntos = meses
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.rating !== null)
    .map(({ m, i }) => ({ x: i * paso + paso / 2, y: escalaRating(m.rating as number) }));

  return (
    <div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        role="img"
        aria-label="Partidas de bala por mes contra el rating de rápida"
      >
        {meses.map((m, i) => {
          const y = escalaBala(m.bala);
          return (
            <rect
              key={m.mes}
              x={i * paso + (paso - anchoBarra) / 2}
              y={y}
              width={anchoBarra}
              height={Math.max(0, base - y)}
              className="fill-tenue/35"
            />
          );
        })}
        {puntos.length >= 2 ? (
          <path
            d={caminoLinea(puntos)}
            fill="none"
            stroke="var(--color-acento)"
            strokeWidth={1.1}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <line x1={0} y1={base} x2={ancho} y2={base} className="stroke-borde" strokeWidth={0.3} />
      </svg>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-2xs text-apagado">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2.5 rounded-sm bg-tenue/35" />
          partidas de bala (hasta {maxBala.toLocaleString('es-CL')})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-acento" />
          rating de rápida ({minRating}–{maxRating})
        </span>
        <span>
          {meses[0]?.mes} a {meses.at(-1)?.mes}
        </span>
      </div>
    </div>
  );
}
