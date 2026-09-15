'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { EvalChart, type PuntoEval } from '@/components/charts/EvalChart';
import { Badge, Clasificacion, cpAPeones } from '@/components/ui';

export type JugadaUI = {
  ply: number;
  san: string;
  uci: string;
  isMine: boolean;
  isBook: boolean;
  evalCp: number | null;
  mateIn: number | null;
  cpLoss: number | null;
  classification: number | null;
  moveTimeMs: number | null;
  clockMs: number | null;
};

function segundos(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

function reloj(ms: number | null): string {
  if (ms === null) return '';
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Revision de una partida: tablero navegable + lista de jugadas + grafico de evaluacion, los tres
 * sincronizados por el ply actual. Es la pantalla que Chess.com llama Game Review y que esta app
 * no tenia: /registro listaba 10.000 partidas y el unico link disponible era hacia chess.com.
 *
 * Los FEN de cada ply se calculan aca, una sola vez, reproduciendo las jugadas con chess.js. El
 * esquema no los guarda a proposito y no hace falta que lo haga.
 */
export function GameReview({
  jugadas,
  orientacion,
  plyInicial,
}: {
  jugadas: readonly JugadaUI[];
  orientacion: 'white' | 'black';
  plyInicial: number;
}) {
  const [ply, setPly] = useState(plyInicial);

  const fens = useMemo(() => {
    const chess = new Chess();
    const lista = [chess.fen()]; // indice 0 = posicion inicial
    for (const j of jugadas) {
      try {
        chess.move(j.san);
      } catch {
        break;
      }
      lista.push(chess.fen());
    }
    return lista;
  }, [jugadas]);

  const maxPly = fens.length - 1;
  const plyAcotado = Math.max(0, Math.min(maxPly, ply));
  const jugadaActual = jugadas[plyAcotado - 1];

  const ir = useCallback((destino: number) => setPly(Math.max(0, Math.min(maxPly, destino))), [maxPly]);

  // La lista sigue a la jugada actual. Sin esto, saltar al ply 30 desde el grafico deja la lista
  // mostrando la jugada 1 y hay que buscar a mano donde estas.
  const listaRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const fila = listaRef.current?.querySelector(`[data-ply="${plyAcotado}"]`);
    fila?.scrollIntoView({ block: 'nearest' });
  }, [plyAcotado]);

  // Flechas del teclado, que es como se navega una partida en cualquier visor de ajedrez.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') ir(plyAcotado - 1);
      else if (e.key === 'ArrowRight') ir(plyAcotado + 1);
      else if (e.key === 'Home') ir(0);
      else if (e.key === 'End') ir(maxPly);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ir, plyAcotado, maxPly]);

  const puntosEval: PuntoEval[] = jugadas.map((j) => ({
    ply: j.ply,
    evalCp: j.evalCp,
    classification: j.classification,
    isMine: j.isMine,
    san: j.san,
  }));

  const flechas = jugadaActual
    ? [
        {
          startSquare: jugadaActual.uci.slice(0, 2),
          endSquare: jugadaActual.uci.slice(2, 4),
          color: jugadaActual.classification === 3 ? '#d03b3b' : '#3987e5',
        },
      ]
    : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
      <div>
        <div className="overflow-hidden rounded-lg">
          <Chessboard
            options={{
              position: fens[plyAcotado],
              boardOrientation: orientacion,
              allowDragging: false,
              arrows: flechas,
              darkSquareStyle: { backgroundColor: '#4a5160' },
              lightSquareStyle: { backgroundColor: '#b9bfcc' },
            }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(
              [
                ['⏮', 0, 'Ir al inicio'],
                ['◀', plyAcotado - 1, 'Jugada anterior'],
                ['▶', plyAcotado + 1, 'Jugada siguiente'],
                ['⏭', maxPly, 'Ir al final'],
              ] as const
            ).map(([icono, destino, etiqueta]) => (
              <button
                key={etiqueta}
                type="button"
                onClick={() => ir(destino)}
                aria-label={etiqueta}
                title={etiqueta}
                className="rounded-lg border border-borde px-2.5 py-1 text-sm text-tenue transition-colors hover:border-borde-fuerte hover:text-texto"
              >
                {icono}
              </button>
            ))}
          </div>
          <span className="text-xs tabular-nums text-apagado">
            {plyAcotado} / {maxPly} · usa ← →
          </span>
        </div>

        {jugadaActual ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono">{jugadaActual.san}</span>
            <Clasificacion valor={jugadaActual.classification} />
            {jugadaActual.isBook ? <Badge>libro</Badge> : null}
            {jugadaActual.evalCp !== null ? (
              <Badge tono="acento">
                {jugadaActual.mateIn !== null ? `M${Math.abs(jugadaActual.mateIn)}` : cpAPeones(jugadaActual.evalCp)}
              </Badge>
            ) : null}
            <span className="text-xs text-tenue">
              {segundos(jugadaActual.moveTimeMs)}
              {jugadaActual.clockMs !== null ? ` · reloj ${reloj(jugadaActual.clockMs)}` : ''}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-tenue">Posición inicial</p>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        {puntosEval.some((p) => p.evalCp !== null) ? (
          <div>
            <p className="mb-1 text-2xs uppercase tracking-wider text-tenue">Evaluación</p>
            <EvalChart puntos={puntosEval} plyActual={plyAcotado} onSeleccionar={ir} />
          </div>
        ) : (
          <p className="text-xs text-tenue">
            Esta partida todavía no está analizada por el motor, así que no hay evaluación ni
            clasificación de jugadas.
          </p>
        )}

        <div>
          <p className="mb-1 text-2xs uppercase tracking-wider text-tenue">Jugadas</p>
          <div className="max-h-[22rem] overflow-y-auto rounded-lg border border-borde">
            <ol ref={listaRef} className="divide-y divide-borde/60">
              {jugadas.map((j) => {
                const numero = Math.ceil(j.ply / 2);
                const esBlancas = j.ply % 2 === 1;
                const activa = j.ply === plyAcotado;
                return (
                  <li key={j.ply} data-ply={j.ply}>
                    <button
                      type="button"
                      onClick={() => ir(j.ply)}
                      aria-current={activa ? 'true' : undefined}
                      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
                        activa ? 'bg-acento/15' : 'hover:bg-panel-alto'
                      }`}
                    >
                      <span className="w-10 shrink-0 text-2xs tabular-nums text-apagado">
                        {esBlancas ? `${numero}.` : ''}
                      </span>
                      <span className={`w-16 shrink-0 font-mono ${j.isMine ? 'text-texto' : 'text-tenue'}`}>
                        {j.san}
                      </span>
                      <span className="shrink-0">
                        <Clasificacion valor={j.isMine ? j.classification : null} soloGlifo />
                      </span>
                      <span className="ml-auto shrink-0 text-2xs tabular-nums text-apagado">
                        {j.evalCp === null
                          ? ''
                          : j.mateIn !== null
                            ? `M${Math.abs(j.mateIn)}`
                            : cpAPeones(j.evalCp)}
                      </span>
                      <span className="w-12 shrink-0 text-right text-2xs tabular-nums text-apagado">
                        {segundos(j.moveTimeMs)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
