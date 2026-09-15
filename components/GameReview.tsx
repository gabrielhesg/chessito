'use client';

import { useCallback, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { EvalChart, type PuntoEval } from '@/components/charts/EvalChart';
import { Badge, Button, Clasificacion, cpAPeones } from '@/components/ui';
import { BarraVentaja } from '@/components/BarraVentaja';
import { EnginePanel } from '@/components/EnginePanel';
import { MoveList } from '@/components/MoveList';
import { formatClock, relojesEnPly } from '@/lib/chess/clock';
import { useBrowserEngine } from '@/lib/engine/useBrowserEngine';
import {
  addMove,
  anterior,
  buildFromMainLine,
  deleteSubtree,
  finDeLinea,
  isMainLine,
  mainLine,
  nearestMainLine,
  siguiente,
  uciPath,
  type MoveTree,
  type NodeId,
} from '@/lib/chess/tree';

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

/**
 * `moves.best_uci` se guarda en UCI, que es lo que habla el motor, pero "c3d4" no se lee: un
 * ajedrecista lee "cxd4". Se traduce desde la posicion ANTERIOR a la jugada. Si la jugada no es
 * legal ahi (dato viejo de otra version del motor), se muestra el UCI crudo antes que nada.
 */
function mejorEnSan(fenAntes: string | undefined, bestUci: string | null): string | null {
  if (!bestUci) return null;
  if (!fenAntes) return bestUci;
  try {
    const tablero = new Chess(fenAntes);
    return tablero.move({
      from: bestUci.slice(0, 2),
      to: bestUci.slice(2, 4),
      promotion: bestUci.length > 4 ? bestUci.slice(4) : undefined,
    }).san;
  } catch {
    return bestUci;
  }
}

/**
 * El tablero es cuadrado y ocupa el ancho de su columna; la barra de ventaja tiene que medir lo
 * mismo. Es un valor fijo porque `react-chessboard` no expone su alto renderizado, y la columna
 * esta acotada a 520px por el grid.
 */
const ALTO_TABLERO = 476;

/** "12." para una jugada de blancas, "12..." para una de negras. */
function numeroDe(ply: number): string {
  return `${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '...'}`;
}

/** Un reloj, con el nombre del jugador. El del que va a mover va resaltado. */
function Reloj({ nombre, ms, activo }: { nombre: string; ms: number | null; activo: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <span className="truncate text-[13px] text-texto-suave">{nombre}</span>
      <span
        className={`rounded-md px-2 py-0.5 font-mono text-[14px] font-medium tabular-nums ${
          activo ? 'bg-panel-alto text-texto' : 'text-tenue'
        }`}
      >
        {formatClock(ms)}
      </span>
    </div>
  );
}

type Estado = { tree: MoveTree<JugadaUI>; cursorId: NodeId };

type Accion =
  | { tipo: 'ir'; id: NodeId }
  | { tipo: 'siguiente' }
  | { tipo: 'anterior' }
  | { tipo: 'inicio' }
  | { tipo: 'fin' }
  | { tipo: 'jugar'; from: string; to: string; promotion?: string }
  | { tipo: 'borrar'; id: NodeId };

/**
 * Despachador corto a proposito: toda la logica del arbol vive en `lib/chess/tree.ts`, que esta
 * testeado aparte. Aca solo se traduce una accion de la UI a una llamada.
 */
function reducer(estado: Estado, accion: Accion): Estado {
  const { tree, cursorId } = estado;
  switch (accion.tipo) {
    case 'ir':
      return tree.nodes[accion.id] ? { tree, cursorId: accion.id } : estado;
    case 'siguiente':
      return { tree, cursorId: siguiente(tree, cursorId) };
    case 'anterior':
      return { tree, cursorId: anterior(tree, cursorId) };
    case 'inicio':
      return { tree, cursorId: tree.rootId };
    case 'fin':
      return { tree, cursorId: finDeLinea(tree, cursorId) };
    case 'jugar': {
      const res = addMove(tree, cursorId, {
        from: accion.from,
        to: accion.to,
        promotion: accion.promotion,
      });
      // Jugada ilegal: el estado no cambia y el tablero devuelve la pieza a su casilla.
      return res ? { tree: res.tree, cursorId: res.nodeId } : estado;
    }
    case 'borrar': {
      const res = deleteSubtree(tree, accion.id);
      return res ? { tree: res.tree, cursorId: res.cursorId } : estado;
    }
  }
}

/**
 * Revision de una partida: tablero, evaluacion, relojes y lista de jugadas, los cuatro
 * sincronizados por la posicion actual.
 *
 * Desde la Fase 8 el estado NO es un numero de ply sino un cursor sobre un arbol
 * (`lib/chess/tree.ts`): la linea principal es la partida real y de cualquier jugada pueden
 * colgar variaciones. Mover una pieza — de cualquier bando — crea una variacion en vez de estar
 * prohibido, que es lo que convierte esta pantalla en un tablero de analisis.
 *
 * Lo que NO existe dentro de una variacion: la clasificacion, el `cp_loss` y el link a entrenar
 * salen de la tabla `moves`, que solo tiene las jugadas que si ocurrieron. Ahi `datos` es null y
 * esos bloques no se dibujan — ni vacios ni inventados. La evaluacion de una variacion la da el
 * motor del navegador.
 */
export function GameReview({
  jugadas,
  orientacion,
  plyInicial,
  resumen,
  gameId,
  baseSeconds,
  jugadorBlancas,
  jugadorNegras,
}: {
  jugadas: readonly JugadaUI[];
  orientacion: 'white' | 'black';
  plyInicial: number;
  /** Tarjetas de resumen de la partida, que el servidor calcula y esta columna solo muestra. */
  resumen?: ReactNode;
  /** Para el link a entrenar la posicion, que solo aparece sobre un error tuyo. */
  gameId: number;
  /** Tiempo base del control de tiempo, para el reloj de quien todavia no ha movido. */
  baseSeconds: number;
  jugadorBlancas: string;
  jugadorNegras: string;
}) {
  const inicial = useMemo<Estado>(() => {
    const tree = buildFromMainLine<JugadaUI>(
      jugadas.map((j) => ({ san: j.san, uci: j.uci, datos: j })),
    );
    // `?ply=N` de los links de "Momentos clave" se resuelve a un nodo. Antes esto solo se leia
    // al montar y el link no re-sincronizaba; ahora el cursor es el unico estado de posicion.
    const destino = mainLine(tree)[plyInicial - 1];
    return { tree, cursorId: destino?.id ?? tree.rootId };
  }, [jugadas, plyInicial]);

  const [{ tree, cursorId }, despachar] = useReducer(reducer, inicial);
  const [motorEncendido, setMotorEncendido] = useState(false);

  const nodo = tree.nodes[cursorId];
  const datos = nodo?.datos ?? null;
  const enPrincipal = isMainLine(tree, cursorId);
  const fenActual = nodo?.fen ?? '';
  const plyActual = nodo?.ply ?? 0;

  const caminoUci = useMemo(() => uciPath(tree, cursorId), [tree, cursorId]);
  const motor = useBrowserEngine({ uciMoves: caminoUci, enabled: motorEncendido });

  const ir = useCallback((id: NodeId) => despachar({ tipo: 'ir', id }), []);

  // Flechas del teclado, que es como se navega una partida en cualquier visor de ajedrez.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') despachar({ tipo: 'anterior' });
      else if (e.key === 'ArrowRight') despachar({ tipo: 'siguiente' });
      else if (e.key === 'Home') despachar({ tipo: 'inicio' });
      else if (e.key === 'End') despachar({ tipo: 'fin' });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const principal = useMemo(() => mainLine(tree), [tree]);

  const puntosEval: PuntoEval[] = useMemo(
    () =>
      principal.map((n) => ({
        ply: n.ply,
        evalCp: n.datos?.evalCp ?? null,
        classification: n.datos?.classification ?? null,
        isMine: n.datos?.isMine ?? false,
        san: n.san,
      })),
    [principal],
  );

  /** El grafico dibuja la partida real: dentro de una variacion se marca de donde colgo. */
  const plyEnGrafico = tree.nodes[nearestMainLine(tree, cursorId)]?.ply ?? 0;

  const irAPlyDelGrafico = useCallback(
    (ply: number) => {
      const destino = mainLine(tree)[ply - 1];
      despachar({ tipo: 'ir', id: destino?.id ?? tree.rootId });
    },
    [tree],
  );

  const flechas = nodo?.uci
    ? [
        {
          startSquare: nodo.uci.slice(0, 2),
          endSquare: nodo.uci.slice(2, 4),
          color: datos?.classification === 3 ? '#e0604f' : '#d9603f',
        },
      ]
    : [];

  // Los dos relojes del momento que se esta mirando. Solo tienen sentido en la partida real: en
  // una variacion no hubo reloj porque esas jugadas no se jugaron.
  const relojes = relojesEnPly(
    principal.map((n) => n.datos?.clockMs ?? null),
    plyEnGrafico,
    baseSeconds,
  );
  const mueveBlancas = fenActual === '' || fenActual.split(' ')[1] !== 'b';

  // La mejor jugada se traduce desde la posicion ANTERIOR, que es la del nodo padre.
  const mejorJugada = mejorEnSan(
    nodo?.parentId ? tree.nodes[nodo.parentId]?.fen : undefined,
    datos?.bestUci ?? null,
  );

  const tonoTarjeta =
    datos?.isMine && datos.classification === 3
      ? 'border-critico/30 bg-critico/[0.07]'
      : datos?.isMine && datos.classification === 2
        ? 'border-serio/30 bg-serio/[0.07]'
        : 'border-borde bg-panel';

  return (
    <div className="grid gap-[26px] lg:grid-cols-[minmax(0,520px)_1fr]">
      <div className="min-w-0">
        <Reloj
          nombre={orientacion === 'white' ? jugadorNegras : jugadorBlancas}
          ms={orientacion === 'white' ? relojes.negras : relojes.blancas}
          activo={orientacion === 'white' ? !mueveBlancas : mueveBlancas}
        />
        <div className="mt-1.5 flex items-stretch gap-2.5">
          <BarraVentaja
            evalCp={datos?.evalCp ?? null}
            mateIn={datos?.mateIn ?? null}
            orientacion={orientacion}
            alto={ALTO_TABLERO}
          />
          <div className="min-w-0 flex-1 overflow-hidden rounded-xl">
            <Chessboard
              options={{
                position: fenActual,
                boardOrientation: orientacion,
                // Se puede mover por los DOS bandos: cualquier jugada abre una variacion.
                allowDragging: true,
                onPieceDrop: ({ sourceSquare, targetSquare }) => {
                  if (!targetSquare) return false;
                  despachar({ tipo: 'jugar', from: sourceSquare, to: targetSquare, promotion: 'q' });
                  // El reducer ya movio si era legal; devolver false deja que react-chessboard
                  // repinte desde `position`, la unica fuente de verdad del tablero.
                  return false;
                },
                arrows: flechas,
                darkSquareStyle: { backgroundColor: '#769656' },
                lightSquareStyle: { backgroundColor: '#eeeed2' },
              }}
            />
          </div>
        </div>
        <Reloj
          nombre={orientacion === 'white' ? jugadorBlancas : jugadorNegras}
          ms={orientacion === 'white' ? relojes.blancas : relojes.negras}
          activo={orientacion === 'white' ? mueveBlancas : !mueveBlancas}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(
              [
                ['⏮', { tipo: 'inicio' }, 'Ir al inicio'],
                ['◀', { tipo: 'anterior' }, 'Jugada anterior'],
                ['▶', { tipo: 'siguiente' }, 'Jugada siguiente'],
                ['⏭', { tipo: 'fin' }, 'Ir al final de esta línea'],
              ] as const
            ).map(([icono, accion, etiqueta]) => (
              <button
                key={etiqueta}
                type="button"
                onClick={() => despachar(accion)}
                aria-label={etiqueta}
                title={etiqueta}
                className="rounded-lg border border-borde px-2.5 py-1.5 text-[13px] text-tenue transition-colors hover:border-borde-fuerte hover:bg-panel-alto hover:text-texto"
              >
                {icono}
              </button>
            ))}
          </div>
          {enPrincipal ? (
            <span className="font-mono text-[11.5px] tabular-nums text-apagado">
              {plyActual} / {principal.length} · usa ← →
            </span>
          ) : (
            <Button
              variante="fantasma"
              onClick={() => despachar({ tipo: 'ir', id: nearestMainLine(tree, cursorId) })}
            >
              Volver a la partida
            </Button>
          )}
        </div>

        {!enPrincipal ? (
          <p className="mt-3.5 rounded-xl border border-dashed border-acento/40 bg-acento/[0.06] px-4 py-3 text-[13px] leading-relaxed text-texto-suave">
            Estás en una variación: estas jugadas no se jugaron. Sigue moviendo para explorarla, o
            vuelve a la partida real. Enciende el motor para ver qué opina de esta posición.
          </p>
        ) : datos ? (
          <div className={`mt-3.5 rounded-xl border px-4 py-3.5 ${tonoTarjeta}`}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-sm font-medium">
                {numeroDe(datos.ply)} {datos.san}
              </span>
              <Clasificacion valor={datos.isMine ? datos.classification : null} />
              {datos.isBook ? <Badge>libro</Badge> : null}
              <span className="ml-auto font-mono text-[11.5px] text-tenue">
                {segundos(datos.moveTimeMs)}
              </span>
            </div>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-texto-suave">
              {datos.evalCp === null ? (
                'Sin evaluación del motor para esta posición.'
              ) : (
                <>
                  La evaluación queda en{' '}
                  <span className="font-mono text-texto">
                    {datos.mateIn !== null ? `M${Math.abs(datos.mateIn)}` : cpAPeones(datos.evalCp)}
                  </span>
                  {datos.cpLoss !== null && datos.cpLoss > 0 ? (
                    <>
                      , una caída de{' '}
                      <span className="font-mono text-texto">{(datos.cpLoss / 100).toFixed(1)}</span>{' '}
                      puntos
                    </>
                  ) : null}
                  {mejorJugada ? (
                    <>
                      . El motor jugaba <span className="font-mono text-texto">{mejorJugada}</span>
                    </>
                  ) : null}
                  .
                </>
              )}
            </p>
            {datos.isMine && (datos.classification ?? 0) >= 2 ? (
              <a
                href={`/entrenador?partida=${gameId}&ply=${datos.ply}`}
                className="mt-2.5 inline-block text-[12.5px] font-medium text-acento hover:underline"
              >
                Entrenar esta posición →
              </a>
            ) : null}
          </div>
        ) : (
          <p className="mt-3.5 rounded-xl border border-borde px-4 py-3.5 text-sm text-tenue">
            Posición inicial. Avanza con ▶, o mueve una pieza para explorar una variación.
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-[18px]">
        {puntosEval.some((p) => p.evalCp !== null) ? (
          <div className={enPrincipal ? '' : 'opacity-60'}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="eyebrow">Evaluación</p>
              <span className="text-[11.5px] text-apagado">Blancas arriba · negras abajo</span>
            </div>
            <EvalChart puntos={puntosEval} plyActual={plyEnGrafico} onSeleccionar={irAPlyDelGrafico} />
          </div>
        ) : (
          <p className="text-xs text-tenue">
            Esta partida todavía no está analizada por el motor, así que no hay evaluación ni
            clasificación de jugadas.
          </p>
        )}

        <EnginePanel
          status={motor.status}
          lines={motor.lines}
          depth={motor.depth}
          engineName={motor.engineName}
          fen={fenActual}
          encendido={motorEncendido}
          onToggle={() => setMotorEncendido((v) => !v)}
          onElegirLinea={(uci) =>
            despachar({
              tipo: 'jugar',
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.length > 4 ? uci.slice(4) : undefined,
            })
          }
        />

        {resumen}

        <div className="min-w-0">
          <p className="eyebrow mb-2">Jugadas</p>
          <MoveList
            tree={tree}
            cursorId={cursorId}
            onIr={ir}
            onBorrar={(id) => despachar({ tipo: 'borrar', id })}
          />
        </div>
      </div>
    </div>
  );
}
