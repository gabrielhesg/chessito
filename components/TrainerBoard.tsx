'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { recordAttempt } from '@/lib/spaced-repetition/actions';
import { explicarBlunder, type Explicacion, type Linea } from '@/lib/puzzles/explain';
import { Badge, Button } from '@/components/ui';

export type PuzzleUI = {
  id: number;
  gameId: number;
  ply: number;
  fen: string;
  playedUci: string;
  bestUci: string;
  solutionLine: string[] | null;
  refutationLine: string[] | null;
  cpLoss: number;
  isUnique: boolean;
  secondBestUci: string | null;
  theme: string | null;
  myColor: 'white' | 'black' | null;
};

const NOMBRE_THEME: Record<string, string> = {
  pieza_colgada: 'Pieza colgada',
  mate_pasillo: 'Mate del pasillo',
  permite_horquilla: 'Permite horquilla',
};

/**
 * No hay limite de intentos: se prueba hasta resolver. El corte a los tres cerraba el ejercicio
 * justo cuando el alumno seguia pensando, que es lo contrario de lo que un ejercicio deberia
 * hacer. Quien quiere ver la respuesta tiene el boton "Ver solucion".
 *
 * Esto NO ablanda la repeticion espaciada: SM-2 califica por acierto al PRIMER intento y sin
 * pista (`lib/spaced-repetition/actions.ts`), asi que insistir no adelanta la proxima aparicion.
 */

type Estado = 'jugando' | 'resuelto' | 'fallado';

/**
 * Pinta la linea como la leeria un ajedrecista: `12.Nf3 Nc6 13.Bb5`. Una linea que arranca con
 * jugada de negras lleva los puntos suspensivos (`12...Qe7`), que es la convencion y ademas es
 * lo unico que deja claro de quien es la jugada.
 */
function LineaJugadas({ linea, desdePly }: { linea: Linea; desdePly: number }) {
  return (
    <ol className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-sm">
      {linea.pasos.map((paso, i) => {
        const plyAbsoluto = desdePly + i;
        const numeroJugada = Math.ceil(plyAbsoluto / 2);
        const esBlancas = plyAbsoluto % 2 === 1;
        const prefijo = esBlancas ? `${numeroJugada}.` : i === 0 ? `${numeroJugada}...` : null;
        return (
          <li key={i} className="flex items-baseline gap-1">
            {prefijo ? <span className="text-apagado">{prefijo}</span> : null}
            <span className={paso.mia ? 'text-texto' : 'text-tenue'}>{paso.san}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PanelExplicacion({
  explicacion,
  puzzle,
  estado,
}: {
  explicacion: Explicacion;
  puzzle: PuzzleUI;
  estado: Estado;
}) {
  const { refutacion, solucion, jugadaSan, mejorSan } = explicacion;
  const material = refutacion?.materialPerdido ?? 0;

  return (
    <div className="space-y-4 text-sm">
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          estado === 'resuelto'
            ? 'border-bien/35 bg-bien/[0.08] text-bien'
            : 'border-critico/35 bg-critico/[0.08] text-critico'
        }`}
      >
        {estado === 'resuelto' ? (
          <>
            <strong>Correcto.</strong> {mejorSan} era la jugada.
          </>
        ) : (
          <>
            <strong>La jugada era {mejorSan}.</strong> En la partida jugaste {jugadaSan}.
          </>
        )}
      </div>

      {refutacion ? (
        <div>
          {/* Sin `uppercase`: en notacion de ajedrez la caja es significativa (N de caballo vs
              la columna f), asi que "Nf6" en mayusculas seria otra jugada distinta. */}
          <p className="mb-1.5 font-mono text-[10.5px] font-medium tracking-[0.11em] text-tenue">
            <span className="uppercase">Por qué</span> <span className="font-mono text-texto">{jugadaSan}</span>{' '}
            <span className="uppercase">pierde</span>
          </p>
          <div className="rounded-xl border border-borde bg-panel-alto px-4 py-3.5">
            <LineaJugadas linea={refutacion} desdePly={puzzle.ply + 1} />
            <p className="mt-2 text-xs text-tenue">
              {refutacion.terminaEnMate ? (
                <>
                  Tu rival da <strong className="text-critico">mate</strong> por la fuerza.
                </>
              ) : material > 0 ? (
                <>
                  Pierdes <strong className="text-critico">{material}</strong>{' '}
                  {material === 1 ? 'punto' : 'puntos'} de material
                  {refutacion.pasos.find((p) => p.captura && !p.mia)
                    ? `: se lleva ${refutacion.pasos.find((p) => p.captura && !p.mia)?.captura?.nombre}`
                    : ''}
                  .
                </>
              ) : (
                <>
                  No pierde material de inmediato, pero la posición empeora{' '}
                  {(puzzle.cpLoss / 100).toFixed(1)} puntos según el motor.
                </>
              )}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-xs text-tenue">
          Este ejercicio todavía no tiene la línea de refutación guardada. Se rellena la próxima
          vez que corra <code className="text-apagado">puzzles:enrich</code>.
        </p>
      )}

      {solucion && solucion.pasos.length > 1 ? (
        <div>
          <p className="mb-1.5 font-mono text-[10.5px] font-medium tracking-[0.11em] text-tenue">
            <span className="uppercase">Qué lograba</span>{' '}
            <span className="font-mono text-texto">{mejorSan}</span>
          </p>
          <div className="rounded-xl border border-borde bg-panel-alto px-4 py-3.5">
            <LineaJugadas linea={solucion} desdePly={puzzle.ply} />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-tenue">
        <span>
          Costó <strong className="text-texto">{(puzzle.cpLoss / 100).toFixed(1)}</strong> puntos
        </span>
        {!puzzle.isUnique && puzzle.secondBestUci ? (
          <Badge tono="acento">Había más de una jugada buena</Badge>
        ) : null}
        <a
          href={`/partida/${puzzle.gameId}?ply=${puzzle.ply}`}
          className="text-acento hover:underline"
        >
          Ver la partida completa →
        </a>
      </div>
    </div>
  );
}

/**
 * El entrenador. Reescrito en la Fase 6C contra tres quejas concretas del uso real:
 *
 *  1. "los ejercicios son solo un movimiento" -> se camina `solution_line`: juegas la mejor, el
 *     rival responde solo desde la linea del motor, y sigues hasta terminarla.
 *  2. "si me equivoco no puedo intentarlo de nuevo" -> una jugada mala hace `undo()` y descuenta
 *     un intento de tres, en vez de bloquear el tablero para siempre.
 *  3. "no me explica por que me equivoque" -> al cerrar se juega la linea de refutacion en el
 *     tablero y se muestra el panel de `lib/puzzles/explain.ts`.
 *
 * Nada de esto es gamificacion (la regla de la Fase 4 sigue en pie: sin rachas, sin insignias,
 * sin notificaciones). Reintentar y explicar son las dos cosas que hacen que el ejercicio ensene
 * algo en vez de solo puntuar.
 */
export type PatronUI = { etiqueta: string; pct: number; titulo: string };

export function TrainerBoard({
  puzzle,
  dueCount,
  patrones = [],
}: {
  puzzle: PuzzleUI;
  dueCount: number;
  /** Aciertos al primer intento por patron. Lo calcula el servidor; aca solo se dibuja. */
  patrones?: readonly PatronUI[];
}) {
  const router = useRouter();

  const solucion = useMemo(
    () => (puzzle.solutionLine?.length ? puzzle.solutionLine : [puzzle.bestUci]),
    [puzzle.solutionLine, puzzle.bestUci],
  );
  const orientacion = puzzle.myColor ?? (puzzle.fen.split(' ')[1] === 'b' ? 'black' : 'white');

  const [game] = useState(() => new Chess(puzzle.fen));
  const [position, setPosition] = useState(puzzle.fen);
  const [paso, setPaso] = useState(0);
  const [estado, setEstado] = useState<Estado>('jugando');
  const [intentos, setIntentos] = useState(0);
  const [pistaUsada, setPistaUsada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [flechas, setFlechas] = useState<Array<{ startSquare: string; endSquare: string; color: string }>>([]);

  // El cronometro arranca al montar, no durante el render: `performance.now()` es impuro y en
  // render puede correr mas de una vez, lo que daria tiempos inventados.
  const iniciadoRef = useRef(0);
  const intentoRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    iniciadoRef.current = performance.now();
  }, []);

  const explicacion = useMemo(
    () =>
      explicarBlunder({
        fen: puzzle.fen,
        playedUci: puzzle.playedUci,
        bestUci: puzzle.bestUci,
        refutationLine: puzzle.refutationLine,
        solutionLine: puzzle.solutionLine,
        cpLoss: puzzle.cpLoss,
      }),
    [puzzle],
  );

  /** Reproduce la linea de refutacion sobre el tablero: ver el castigo es la explicacion. */
  const mostrarRefutacion = useCallback(() => {
    const tablero = new Chess(puzzle.fen);
    const jugar = (uci: string): boolean => {
      try {
        tablero.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci.slice(4) : undefined,
        });
        return true;
      } catch {
        return false;
      }
    };

    if (!jugar(puzzle.playedUci)) return;
    setPosition(tablero.fen());
    setFlechas([
      { startSquare: puzzle.playedUci.slice(0, 2), endSquare: puzzle.playedUci.slice(2, 4), color: '#e0604f' },
    ]);

    const linea = puzzle.refutationLine ?? [];
    linea.forEach((uci, i) => {
      setTimeout(
        () => {
          if (!jugar(uci)) return;
          setPosition(tablero.fen());
          setFlechas([{ startSquare: uci.slice(0, 2), endSquare: uci.slice(2, 4), color: '#e0604f' }]);
        },
        600 * (i + 1),
      );
    });
  }, [puzzle.fen, puzzle.playedUci, puzzle.refutationLine]);

  const cerrar = useCallback(
    (resuelto: boolean, playedUci: string, numeroIntento: number) => {
      setEstado(resuelto ? 'resuelto' : 'fallado');
      intentoRef.current = recordAttempt({
        puzzleId: puzzle.id,
        playedUci,
        correct: resuelto,
        msTaken: Math.round(performance.now() - iniciadoRef.current),
        attemptNo: numeroIntento,
        hintUsed: pistaUsada,
        cierra: true,
      });
      if (!resuelto) mostrarRefutacion();
    },
    [puzzle.id, pistaUsada, mostrarRefutacion],
  );

  const onPieceDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }): boolean => {
      if (estado !== 'jugando' || !targetSquare) return false;

      let jugada;
      try {
        jugada = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      } catch {
        return false;
      }

      const uci = `${jugada.from}${jugada.to}${jugada.promotion ?? ''}`;
      const esperada = solucion[paso];
      const numeroIntento = intentos + 1;

      if (uci !== esperada) {
        // Reintentar: se deshace la jugada y el tablero vuelve, en vez de quedar bloqueado.
        game.undo();
        setIntentos(numeroIntento);
        setAviso(null);
        setFlechas([]);

        void recordAttempt({
          puzzleId: puzzle.id,
          playedUci: uci,
          correct: false,
          msTaken: Math.round(performance.now() - iniciadoRef.current),
          attemptNo: numeroIntento,
          hintUsed: pistaUsada,
          cierra: false,
        });
        setAviso('Esa no. Prueba otra.');
        return false;
      }

      // Acertaste. Si la linea sigue, responde el rival y te toca la siguiente.
      setPosition(game.fen());
      setAviso(null);
      setFlechas([]);
      const respuesta = solucion[paso + 1];

      if (respuesta === undefined) {
        cerrar(true, uci, numeroIntento);
        setPaso(paso + 1);
        return true;
      }

      setTimeout(() => {
        try {
          game.move({
            from: respuesta.slice(0, 2),
            to: respuesta.slice(2, 4),
            promotion: respuesta.length > 4 ? respuesta.slice(4) : undefined,
          });
          setPosition(game.fen());
          if (solucion[paso + 2] === undefined) cerrar(true, uci, numeroIntento);
          else setPaso(paso + 2);
        } catch {
          cerrar(true, uci, numeroIntento);
        }
      }, 400);

      return true;
    },
    [estado, game, solucion, paso, intentos, cerrar, puzzle.id, pistaUsada],
  );

  const pedirPista = useCallback(() => {
    const esperada = solucion[paso];
    if (!esperada) return;
    setPistaUsada(true);
    setFlechas([]);
    setAviso(`Mueve la pieza de ${esperada.slice(0, 2)}.`);
  }, [solucion, paso]);

  const rendirse = useCallback(() => {
    cerrar(false, '', intentos + 1);
  }, [cerrar, intentos]);

  // El intento en vuelo se espera antes de refrescar: si no, el servidor puede devolver el
  // MISMO ejercicio porque `due_at` todavia no se actualizo.
  const siguiente = useCallback(() => {
    void (async () => {
      if (intentoRef.current) await intentoRef.current;
      router.refresh();
    })();
  }, [router]);

  const tocaMover = estado === 'jugando';

  return (
    <div className="grid gap-[26px] lg:grid-cols-[minmax(0,460px)_1fr]">
      <div className="min-w-0">
        <div className="overflow-hidden rounded-xl">
          <Chessboard
            options={{
              position,
              onPieceDrop,
              boardOrientation: orientacion,
              allowDragging: tocaMover,
              arrows: flechas,
              darkSquareStyle: { backgroundColor: '#769656' },
              lightSquareStyle: { backgroundColor: '#eeeed2' },
            }}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-tenue">
          <Badge tono="acento">{orientacion === 'white' ? 'Juegan blancas' : 'Juegan negras'}</Badge>
          {puzzle.theme && NOMBRE_THEME[puzzle.theme] ? <Badge>{NOMBRE_THEME[puzzle.theme]}</Badge> : null}
          <span className="ml-auto font-mono text-[11.5px] text-apagado">{dueCount} pendientes</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {estado === 'jugando' ? (
          <div className="space-y-3">
            <p className="text-sm">
              Encuentra la jugada que se te escapó.
              {solucion.length > 1 ? ' La línea sigue después de la primera jugada.' : ''}
            </p>
            {aviso ? (
              <p className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">{aviso}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-tenue">
                {intentos === 0 ? 'Primer intento' : `Intento ${intentos + 1}`}
              </span>
              <Button variante="fantasma" onClick={pedirPista}>
                Pista
              </Button>
              <Button variante="fantasma" onClick={rendirse}>
                Ver solución
              </Button>
            </div>
          </div>
        ) : (
          <>
            <PanelExplicacion explicacion={explicacion} puzzle={puzzle} estado={estado} />
            <Button variante="primario" onClick={siguiente}>
              Siguiente ejercicio
            </Button>
          </>
        )}

        {patrones.length > 0 ? (
          <div className="mt-1.5 border-t border-borde pt-3.5">
            <p className="eyebrow mb-2.5">En qué patrón tropiezas más</p>
            <div className="flex flex-col gap-2 text-[12.5px]">
              {patrones.map((p) => (
                <div key={p.etiqueta} className="flex items-center gap-2.5" title={p.titulo}>
                  <span className="w-[92px] shrink-0 text-texto-suave sm:w-[130px]">{p.etiqueta}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-borde">
                    <span
                      className="block h-full rounded-full bg-acento"
                      style={{ width: `${Math.max(2, Math.round(p.pct))}%` }}
                    />
                  </span>
                  <span className="w-9 shrink-0 text-right font-mono text-apagado">{p.pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] text-apagado">
              Aciertos al primer intento, sin pista. Los peores primero.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
