'use client';

import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import type { EvalLine } from '@/lib/engine/session';
import type { EngineStatus } from '@/lib/engine/useBrowserEngine';
import { toWhitePerspective } from '@/lib/analysis/signs';
import { cpAPeones } from '@/components/ui';
import { MiniBoard } from '@/components/MiniBoard';

/** Una jugada de una linea del motor, con la posicion que deja. */
export type PasoDeLinea = {
  san: string;
  /** El FEN DESPUES de la jugada: es lo que dibuja la miniatura. */
  fen: string;
  /** Casilla de origen y destino, para marcarlas en la miniatura. */
  desde: string;
  hasta: string;
};

/**
 * Traduce una linea UCI a notacion algebraica desde un FEN, devolviendo ademas la posicion que
 * deja cada jugada. Corta en la primera jugada ilegal en vez de tirar: una PV puede venir
 * truncada.
 *
 * El FEN por paso no es un extra: el tablero ya se estaba reproduciendo aca y se tiraba. Es lo
 * que permite mostrar la miniatura de cualquier jugada de la linea sin volver a calcular nada.
 */
export function lineaEnSan(fen: string, uciMoves: readonly string[], maximo: number): PasoDeLinea[] {
  let tablero: Chess;
  try {
    tablero = new Chess(fen);
  } catch {
    return [];
  }
  const pasos: PasoDeLinea[] = [];
  for (const uci of uciMoves.slice(0, maximo)) {
    try {
      const jugada = tablero.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length > 4 ? uci.slice(4) : undefined,
      });
      pasos.push({
        san: jugada.san,
        fen: tablero.fen(),
        desde: jugada.from,
        hasta: jugada.to,
      });
    } catch {
      break;
    }
  }
  return pasos;
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
  orientacion = 'white',
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
  /** Con negras abajo, la miniatura tambien se da vuelta. */
  orientacion?: 'white' | 'black';
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
        pasos: lineaEnSan(fen, linea.pv, 8),
      })),
    [lines, fen, mueveBlancas],
  );

  const mensaje = MENSAJE[status];

  // La jugada que se esta mirando, para la miniatura. Se abre con el mouse Y con foco o tap: en
  // el celular, que es como se usa la app la mayor parte del tiempo, "pasar el mouse" no existe.
  // La Fase 5 ya borro `Muestra`/`title=` por exactamente esta razon.
  const [mirando, setMirando] = useState<PasoDeLinea | null>(null);

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
        <ol className="relative mt-2.5 flex flex-col gap-1">
          {filas.map((fila) => (
            <li key={fila.rank} className="flex items-baseline gap-2.5 px-2 py-1">
              <button
                type="button"
                onClick={() => fila.primera && onElegirLinea(fila.primera)}
                title="Jugar esta linea en el tablero"
                className="w-12 shrink-0 rounded font-mono text-[12.5px] font-medium tabular-nums transition-colors hover:text-acento"
              >
                {fila.etiqueta}
              </button>
              <span className="flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5">
                {fila.pasos.map((paso, i) => (
                  <button
                    key={`${paso.san}-${i}`}
                    type="button"
                    onMouseEnter={() => setMirando(paso)}
                    onMouseLeave={() => setMirando((v) => (v === paso ? null : v))}
                    onFocus={() => setMirando(paso)}
                    onBlur={() => setMirando((v) => (v === paso ? null : v))}
                    onClick={() => setMirando((v) => (v === paso ? null : paso))}
                    /* Sin `uppercase`: en notacion de ajedrez la caja es significativa. */
                    className="rounded px-0.5 font-mono text-[12.5px] text-texto-suave transition-colors hover:bg-panel-alto hover:text-texto"
                  >
                    {paso.san}
                  </button>
                ))}
              </span>
            </li>
          ))}

          {mirando ? (
            <div className="pointer-events-none absolute right-0 bottom-full z-20 mb-2 rounded-lg border border-borde bg-panel p-1.5 shadow-lg">
              <MiniBoard
                fen={mirando.fen}
                orientacion={orientacion}
                resaltadas={[mirando.desde, mirando.hasta]}
              />
              <p className="mt-1 text-center font-mono text-[11px] text-tenue">{mirando.san}</p>
            </div>
          ) : null}
        </ol>
      )}
    </div>
  );
}
