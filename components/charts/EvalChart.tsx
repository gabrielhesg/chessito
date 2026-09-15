'use client';

import { caminoArea, caminoLinea, type Punto } from '@/lib/charts/path';
import { escalaLineal } from '@/lib/charts/scale';
import { winPct } from '@/lib/analysis/winpct';

export type PuntoEval = {
  ply: number;
  /** Evaluacion en centipeones, EN PERSPECTIVA DE BLANCAS (como la guarda `moves.eval_cp`). */
  evalCp: number | null;
  classification: number | null;
  isMine: boolean;
  san: string;
};

/**
 * El grafico de evaluacion de una partida: el unico grafico que todo ajedrecista reconoce de
 * inmediato, y que esta app no tenia.
 *
 * El eje y NO son centipeones, es win% (la funcion que ya usa el analizador). Los centipeones no
 * estan acotados — un mate vale 10.000 — asi que una escala lineal en cp deja el 95% de la
 * partida aplastada contra el cero. En win% una ventaja decisiva se acerca al borde de forma
 * suave, que es como se lee la evaluacion de verdad.
 *
 * Divergente alrededor del 50%: arriba manda blancas, abajo negras. Es la convencion de
 * chess.com y Lichess y no hay razon para inventar otra.
 */
export function EvalChart({
  puntos,
  plyActual,
  onSeleccionar,
  alto = 120,
}: {
  puntos: readonly PuntoEval[];
  plyActual: number;
  onSeleccionar: (ply: number) => void;
  alto?: number;
}) {
  const conEval = puntos.filter((p) => p.evalCp !== null);
  if (conEval.length < 2) return null;

  const ANCHO = 1000;
  const maxPly = Math.max(...puntos.map((p) => p.ply));
  const x = escalaLineal([1, maxPly], [0, ANCHO]);
  const y = escalaLineal([0, 100], [alto, 0]);
  const cero = y(50);

  // Las jugadas sin evaluar (las de libro) heredan la ultima conocida, para que la linea no se
  // corte en pedazos: el motor no las evalua a proposito, no es que falten datos.
  // Se arma con un `reduce` y no con un `map` sobre una variable externa: React prohibe mutar
  // algo de fuera durante el render, y con razon — el render puede repetirse.
  const serie: Punto[] = puntos.reduce<{ ultima: number; puntos: Punto[] }>(
    (acc, p) => {
      const ultima = p.evalCp !== null ? winPct(p.evalCp) : acc.ultima;
      acc.puntos.push({ x: x(p.ply), y: y(ultima) });
      return { ultima, puntos: acc.puntos };
    },
    { ultima: 50, puntos: [] },
  ).puntos;

  const blunders = puntos.filter((p) => p.classification === 3 && p.evalCp !== null);
  const xActual = x(plyActual);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${ANCHO} ${alto}`}
        preserveAspectRatio="none"
        className="w-full cursor-pointer"
        style={{ height: alto }}
        role="img"
        aria-label="Evaluación de la partida jugada a jugada"
        onClick={(e) => {
          const caja = e.currentTarget.getBoundingClientRect();
          const proporcion = (e.clientX - caja.left) / caja.width;
          const ply = Math.round(1 + proporcion * (maxPly - 1));
          onSeleccionar(Math.max(1, Math.min(maxPly, ply)));
        }}
      >
        <rect x={0} y={0} width={ANCHO} height={alto} fill="var(--color-ventaja-negras)" opacity={0.25} />
        <path d={caminoArea(serie, cero)} fill="var(--color-ventaja-blancas)" opacity={0.85} />
        <line x1={0} y1={cero} x2={ANCHO} y2={cero} stroke="var(--color-eje)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path
          d={caminoLinea(serie)}
          fill="none"
          stroke="var(--color-texto)"
          strokeWidth={1}
          opacity={0.5}
          vectorEffect="non-scaling-stroke"
        />

        {blunders.map((b) => (
          <circle
            key={b.ply}
            cx={x(b.ply)}
            cy={y(winPct(b.evalCp ?? 0))}
            r={4}
            fill="var(--color-critico)"
            stroke="var(--color-panel)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`Ply ${b.ply} · ${b.san} · error grave`}</title>
          </circle>
        ))}

        <line
          x1={xActual}
          y1={0}
          x2={xActual}
          y2={alto}
          stroke="var(--color-acento)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-1 flex justify-between text-2xs text-apagado">
        <span>Haz click para saltar a esa jugada</span>
        <span>
          {blunders.length === 0
            ? 'Sin errores graves'
            : blunders.length === 1
              ? '1 error grave marcado'
              : `${blunders.length} errores graves marcados`}
        </span>
      </div>
    </div>
  );
}
