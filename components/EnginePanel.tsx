'use client';

import { useMemo } from 'react';
import { Chess } from 'chess.js';
import type { EvalLine } from '@/lib/engine/session';
import type { EngineStatus } from '@/lib/engine/useBrowserEngine';
import { toWhitePerspective } from '@/lib/analysis/signs';
import { cpAPeones } from '@/components/ui';

/**
 * Traduce una linea UCI a notacion algebraica desde un FEN. Corta en la primera jugada ilegal
 * en vez de tirar: una PV puede venir truncada.
 */
function lineaEnSan(fen: string, uciMoves: readonly string[], maximo: number): string[] {
  let tablero: Chess;
  try {
    tablero = new Chess(fen);
  } catch {
    return [];
  }
  const sans: string[] = [];
  for (const uci of uciMoves.slice(0, maximo)) {
    try {
      const jugada = tablero.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4) : undefined,
      });
      sans.push(jugada.san);
    } catch {
      break;
    }
  }
  return sans;
}

const MENSAJE: Partial<Record<EngineStatus, string>> = {
  apagado: 'El motor está apagado. Enciéndelo para ver las mejores jugadas de cualquier posición.',
  cargando: 'Bajando el motor… son unos 7 MB y queda en caché para la próxima.',
  'no-soportado': 'Este navegador no puede correr el motor. Las evaluaciones de la partida se siguen viendo.',
  error: 'No se pudo cargar el motor. Las evaluaciones de la partida se siguen viendo.',
};

/**
 * Las mejores lineas del motor para la posicion que se esta mirando, refinandose en vivo.
 *
 * Es presentacion pura: toda la coordinacion (cancelacion, carga perezosa, degradacion) vive en
 * `useBrowserEngine`. Aca solo se dibuja lo que el hook devuelve.
 */
export function EnginePanel({
  status,
  lines,
  depth,
  engineName,
  fen,
  encendido,
  onToggle,
  onElegirLinea,
}: {
  status: EngineStatus;
  lines: readonly EvalLine[];
  depth: number;
  engineName: string;
  /** La posicion actual, para traducir las lineas a notacion algebraica. */
  fen: string;
  encendido: boolean;
  onToggle: () => void;
  /** Jugar la primera jugada de una linea en el tablero, como variacion. */
  onElegirLinea: (uci: string) => void;
}) {
  const mueveBlancas = fen.split(' ')[1] !== 'b';

  const filas = useMemo(
    () =>
      lines.map((linea) => ({
        rank: linea.rank,
        primera: linea.pv[0] ?? '',
        // El score viene en perspectiva del que mueve; se muestra en perspectiva de blancas,
        // que es la convencion de toda la app. El giro lo hace `lib/analysis/signs.ts`, no este
        // componente: re-derivar signos fuera de ahi es la trampa 2 del proyecto.
        etiqueta:
          linea.mateIn !== null
            ? `M${Math.abs(linea.mateIn)}`
            : linea.scoreCp === null
              ? '—'
              : cpAPeones(toWhitePerspective(linea.scoreCp, mueveBlancas ? 'white' : 'black')),
        sans: lineaEnSan(fen, linea.pv, 8),
      })),
    [lines, fen, mueveBlancas],
  );

  const mensaje = MENSAJE[status];

  return (
    <div className="rounded-xl border border-borde bg-panel px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="eyebrow">Motor</p>
        {status === 'pensando' ? (
          <span className="font-mono text-[11px] text-apagado">profundidad {depth}</span>
        ) : null}
        {engineName && status !== 'apagado' ? (
          <span className="truncate font-mono text-[11px] text-apagado">{engineName}</span>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          disabled={status === 'no-soportado'}
          className="ml-auto rounded-lg border border-borde px-2.5 py-1 text-[12.5px] text-tenue transition-colors hover:border-borde-fuerte hover:text-texto disabled:opacity-50"
        >
          {encendido ? 'Apagar' : 'Encender'}
        </button>
      </div>

      {mensaje ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-tenue">{mensaje}</p>
      ) : filas.length === 0 ? (
        <p className="mt-2.5 text-[12.5px] text-tenue">Pensando…</p>
      ) : (
        <ol className="mt-2.5 flex flex-col gap-1">
          {filas.map((fila) => (
            <li key={fila.rank}>
              <button
                type="button"
                onClick={() => fila.primera && onElegirLinea(fila.primera)}
                className="flex w-full items-baseline gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-panel-alto"
              >
                <span className="w-12 shrink-0 font-mono text-[12.5px] font-medium tabular-nums">
                  {fila.etiqueta}
                </span>
                {/* Sin `uppercase`: en notacion de ajedrez la caja es significativa. */}
                <span className="truncate font-mono text-[12.5px] text-texto-suave">
                  {fila.sans.join(' ')}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
