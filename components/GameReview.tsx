'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { EvalChart, type PuntoEval } from '@/components/charts/EvalChart';
import { Badge, Clasificacion, cpAPeones } from '@/components/ui';

export type JugadaUI = {
  ply: number;
  san: string;
  uci: string;
  bestUci: string | null;
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

/** "12." para una jugada de blancas, "12..." para una de negras, como en cualquier visor. */
function numeroDe(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`;
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
  resumen,
  gameId,
}: {
  jugadas: readonly JugadaUI[];
  orientacion: 'white' | 'black';
  plyInicial: number;
  /** Tarjetas de resumen de la partida, que el servidor calcula y esta columna solo muestra. */
  resumen?: ReactNode;
  /** Para el link a entrenar la posicion, que solo aparece sobre un error tuyo. */
  gameId: number;
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

  // La lista va a dos columnas, como cualquier planilla de ajedrez: una fila por numero de
  // jugada, con la de blancas y la de negras al lado. En una sola columna, una partida de 43
  // jugadas son 86 filas y hay que hacer scroll el doble para encontrar nada.
  const filas = useMemo(() => {
    const porNumero = new Map<number, { numero: number; blancas?: JugadaUI; negras?: JugadaUI }>();
    for (const j of jugadas) {
      const numero = Math.ceil(j.ply / 2);
      const fila = porNumero.get(numero) ?? { numero };
      if (j.ply % 2 === 1) fila.blancas = j;
      else fila.negras = j;
      porNumero.set(numero, fila);
    }
    return [...porNumero.values()];
  }, [jugadas]);

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
          color: jugadaActual.classification === 3 ? '#e0604f' : '#d9603f',
        },
      ]
    : [];

  // La tarjeta de la jugada actual toma el color de su clasificacion: coral apagado para un
  // error grave, borde neutro para el resto. El glifo de `Clasificacion` sigue siendo el canal.
  const tonoTarjeta =
    jugadaActual?.isMine && jugadaActual.classification === 3
      ? 'border-critico/30 bg-critico/[0.07]'
      : jugadaActual?.isMine && jugadaActual.classification === 2
        ? 'border-serio/30 bg-serio/[0.07]'
        : 'border-borde bg-panel';

  return (
    <div className="grid gap-[26px] lg:grid-cols-[minmax(0,520px)_1fr]">
      <div className="min-w-0">
        <div className="overflow-hidden rounded-xl">
          <Chessboard
            options={{
              position: fens[plyAcotado],
              boardOrientation: orientacion,
              allowDragging: false,
              arrows: flechas,
              darkSquareStyle: { backgroundColor: '#769656' },
              lightSquareStyle: { backgroundColor: '#eeeed2' },
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
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
                className="rounded-lg border border-borde px-2.5 py-1.5 text-[13px] text-tenue transition-colors hover:border-borde-fuerte hover:bg-panel-alto hover:text-texto"
              >
                {icono}
              </button>
            ))}
          </div>
          <span className="font-mono text-[11.5px] tabular-nums text-apagado">
            {plyAcotado} / {maxPly} · usa ← →
          </span>
        </div>

        {jugadaActual ? (
          <div className={`mt-3.5 rounded-xl border px-4 py-3.5 ${tonoTarjeta}`}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm font-medium">
                {numeroDe(jugadaActual.ply)} {jugadaActual.san}
              </span>
              <Clasificacion valor={jugadaActual.isMine ? jugadaActual.classification : null} />
              {jugadaActual.isBook ? <Badge>libro</Badge> : null}
              <span className="ml-auto font-mono text-[11.5px] text-tenue">
                {segundos(jugadaActual.moveTimeMs)}
                {jugadaActual.clockMs !== null ? ` · reloj ${reloj(jugadaActual.clockMs)}` : ''}
              </span>
            </div>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-texto-suave">
              {jugadaActual.evalCp === null ? (
                'Sin evaluación del motor para esta posición.'
              ) : (
                <>
                  La evaluación queda en{' '}
                  <span className="font-mono text-texto">
                    {jugadaActual.mateIn !== null
                      ? `M${Math.abs(jugadaActual.mateIn)}`
                      : cpAPeones(jugadaActual.evalCp)}
                  </span>
                  {jugadaActual.cpLoss !== null && jugadaActual.cpLoss > 0 ? (
                    <>
                      , una caída de{' '}
                      <span className="font-mono text-texto">{(jugadaActual.cpLoss / 100).toFixed(1)}</span> puntos
                    </>
                  ) : null}
                  {jugadaActual.bestUci ? (
                    <>
                      . El motor jugaba <span className="font-mono text-texto">{jugadaActual.bestUci}</span>
                    </>
                  ) : null}
                  .
                </>
              )}
            </p>
            {jugadaActual.isMine && (jugadaActual.classification ?? 0) >= 2 ? (
              <a
                href={`/entrenador?partida=${gameId}&ply=${jugadaActual.ply}`}
                className="mt-2.5 inline-block text-[12.5px] font-medium text-acento hover:underline"
              >
                Entrenar esta posición →
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-3.5 rounded-xl border border-borde px-4 py-3.5 text-sm text-tenue">
            Posición inicial. Avanza con ▶ o con la flecha derecha.
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        {puntosEval.some((p) => p.evalCp !== null) ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="eyebrow">Evaluación</p>
              <span className="text-[11.5px] text-apagado">Blancas arriba · negras abajo</span>
            </div>
            <EvalChart puntos={puntosEval} plyActual={plyAcotado} onSeleccionar={ir} />
          </div>
        ) : (
          <p className="text-xs text-tenue">
            Esta partida todavía no está analizada por el motor, así que no hay evaluación ni
            clasificación de jugadas.
          </p>
        )}

        {resumen}

        <div className="min-w-0">
          <p className="eyebrow mb-2">Jugadas</p>
          <div className="max-h-[300px] overflow-y-auto rounded-xl border border-borde">
            <ol ref={listaRef} className="divide-y divide-borde/60">
              {filas.map(({ numero, blancas, negras }) => (
                <li key={numero} className="flex items-stretch">
                  <span className="flex w-9 shrink-0 items-center bg-panel-alto/60 px-2 font-mono text-[11px] tabular-nums text-apagado">
                    {numero}
                  </span>
                  {[blancas, negras].map((j, columna) =>
                    j ? (
                      <button
                        key={columna}
                        type="button"
                        data-ply={j.ply}
                        onClick={() => ir(j.ply)}
                        aria-current={j.ply === plyAcotado ? 'true' : undefined}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                          j.ply === plyAcotado ? 'bg-acento/15 text-texto' : 'hover:bg-panel-alto'
                        }`}
                      >
                        <span className={`font-mono ${j.isMine ? 'text-texto' : 'text-tenue'}`}>{j.san}</span>
                        <Clasificacion valor={j.isMine ? j.classification : null} soloGlifo />
                        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-apagado">
                          {j.evalCp === null
                            ? ''
                            : j.mateIn !== null
                              ? `M${Math.abs(j.mateIn)}`
                              : cpAPeones(j.evalCp)}
                        </span>
                      </button>
                    ) : (
                      <span key={columna} className="flex-1" />
                    ),
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
