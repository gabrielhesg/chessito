"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import {
  anotarConceptoElegido,
  recordAttempt,
} from "@/lib/spaced-repetition/actions";
import { PreguntaQuePaso } from "@/components/PreguntaQuePaso";
import {
  conceptoDelError,
  describirLinea,
  diferenciaEnPeones,
  explicarBlunder,
  logroDeLaSolucion,
  TEXTO_CONCEPTO,
  type Concepto,
  type Explicacion,
  type Linea,
  type PasoLinea,
} from "@/lib/puzzles/explain";
import {
  MiniBoardPopover,
  useMiniBoardPopover,
} from "@/components/MiniBoardPopover";
import {
  diagnosticar,
  frasesDelDiagnostico,
  type Diagnostico,
} from "@/lib/puzzles/diagnostico";
import { useBrowserEngine } from "@/lib/engine/useBrowserEngine";
import { Badge, Button } from "@/components/ui";
import { BarraVentaja } from "@/components/BarraVentaja";
import { EnginePanel } from "@/components/EnginePanel";
import { toWhitePerspective } from "@/lib/analysis/signs";

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
  myColor: "white" | "black" | null;
};

const NOMBRE_THEME: Record<string, string> = {
  pieza_colgada: "Pieza colgada",
  mate_pasillo: "Mate del pasillo",
  permite_horquilla: "Permite horquilla",
};

/**
 * No hay limite de intentos: se prueba hasta resolver. El corte a los tres cerraba el ejercicio
 * justo cuando el alumno seguia pensando, que es lo contrario de lo que un ejercicio deberia
 * hacer. Quien quiere ver la respuesta tiene el boton "Ver solucion".
 *
 * Esto NO ablanda la repeticion espaciada: SM-2 califica por acierto al PRIMER intento y sin
 * pista (`lib/spaced-repetition/actions.ts`), asi que insistir no adelanta la proxima aparicion.
 */

/**
 * `preguntando` se intercala entre fallar y ver la respuesta: es donde va la pregunta de un
 * tap. Despues de revelar, preguntar no mediria nada porque la respuesta ya es obvia.
 */
type Estado = "jugando" | "preguntando" | "resuelto" | "fallado";

/**
 * Pinta la linea como la leeria un ajedrecista: `12.Nf3 Nc6 13.Bb5`. Una linea que arranca con
 * jugada de negras lleva los puntos suspensivos (`12...Qe7`), que es la convencion y ademas es
 * lo unico que deja claro de quien es la jugada.
 *
 * Cada jugada es tocable: posarse encima muestra la miniatura de esa posicion y hacer click lleva
 * el TABLERO GRANDE hasta ahi. Sin eso la linea era texto muerto — decia cual era la jugada sin
 * dejar ver que pasa despues, que es justo lo que hay que entender.
 */
function LineaJugadas({
  linea,
  desdePly,
  orientacion,
  onIr,
  plyMirado,
}: {
  linea: Linea;
  desdePly: number;
  orientacion: "white" | "black";
  onIr: (paso: PasoLinea) => void;
  /** El indice del paso que se esta viendo en el tablero grande, para resaltarlo. */
  plyMirado: number | null;
}) {
  const { mirando, propsDePaso } = useMiniBoardPopover();

  return (
    <div className="relative">
      <ol className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-sm">
        {linea.pasos.map((paso, i) => {
          const plyAbsoluto = desdePly + i;
          const numeroJugada = Math.ceil(plyAbsoluto / 2);
          const esBlancas = plyAbsoluto % 2 === 1;
          const prefijo = esBlancas
            ? `${numeroJugada}.`
            : i === 0
              ? `${numeroJugada}...`
              : null;
          return (
            <li key={i} className="flex items-baseline gap-1">
              {prefijo ? <span className="text-apagado">{prefijo}</span> : null}
              <button
                type="button"
                {...propsDePaso(paso)}
                onClick={() => onIr(paso)}
                className={`rounded px-1 transition-colors hover:bg-panel-alto hover:text-texto ${
                  i === plyMirado
                    ? "bg-acento/20 text-texto"
                    : paso.mia
                      ? "text-texto"
                      : "text-tenue"
                }`}
              >
                {paso.san}
              </button>
            </li>
          );
        })}
      </ol>
      <MiniBoardPopover
        paso={mirando}
        orientacion={orientacion}
        posicion="abajo-izquierda"
      />
      <p className="mt-2 text-[11.5px] text-apagado">
        Toca una jugada para verla en el tablero.
      </p>
    </div>
  );
}

/** La posicion despues de una jugada. null si la jugada es ilegal ahi. */
function fenDespuesDe(fen: string, uci: string): string | null {
  try {
    const tablero = new Chess(fen);
    tablero.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4) : undefined,
    });
    return tablero.fen();
  } catch {
    return null;
  }
}

function PanelExplicacion({
  explicacion,
  puzzle,
  estado,
  estadoMotor,
  orientacion,
  onIr,
  mirado,
  diagnostico,
}: {
  explicacion: Explicacion;
  puzzle: PuzzleUI;
  estado: Estado;
  /** Para avisar que la linea se esta calculando en vez de decir que no existe. */
  estadoMotor: "calculando" | "listo" | "sin-motor";
  orientacion: "white" | "black";
  /** Llevar el tablero grande a una jugada de una de las dos lineas. */
  onIr: (
    linea: "refutacion" | "solucion",
    indice: number,
    paso: PasoLinea,
  ) => void;
  /** Que jugada de que linea se esta mirando en el tablero grande. */
  mirado: { linea: "refutacion" | "solucion"; indice: number } | null;
  /** El diagnostico del error, que es lo que convierte el panel en una explicacion. */
  diagnostico: Diagnostico | null;
}) {
  const { refutacion, solucion, jugadaSan, mejorSan } = explicacion;
  const material = refutacion?.materialPerdido ?? 0;
  const logro = logroDeLaSolucion(solucion);
  const diferencia = diferenciaEnPeones(puzzle.cpLoss);
  // El concepto sale del diagnostico si lo hay: es el que mira la linea del rival en vez de
  // adivinar sobre la estructura, y por eso deja de decir siempre lo mismo.
  const concepto = diagnostico
    ? {
        tipo: diagnostico.concepto,
        texto: TEXTO_CONCEPTO[diagnostico.concepto],
      }
    : explicacion.concepto;
  const frases = diagnostico ? frasesDelDiagnostico(diagnostico) : [];

  return (
    <div className="space-y-4 text-sm">
      <div
        className={`rounded-xl border px-4 py-3 text-sm ${
          estado === "resuelto"
            ? "border-bien/35 bg-bien/[0.08] text-bien"
            : "border-critico/35 bg-critico/[0.08] text-critico"
        }`}
      >
        {estado === "resuelto" ? (
          <>
            <strong>Correcto.</strong> {mejorSan} era la jugada.
          </>
        ) : (
          <>
            <strong>La jugada era {mejorSan}.</strong> En la partida jugaste{" "}
            {jugadaSan}.
          </>
        )}
      </div>

      {refutacion ? (
        <div>
          {/* Sin `uppercase`: en notacion de ajedrez la caja es significativa (N de caballo vs
              la columna f), asi que "Nf6" en mayusculas seria otra jugada distinta. */}
          <p className="mb-1.5 font-mono text-[10.5px] font-medium tracking-[0.11em] text-tenue">
            <span className="uppercase">Por qué</span>{" "}
            <span className="font-mono text-texto">{jugadaSan}</span>{" "}
            <span className="uppercase">pierde</span>
          </p>
          <div className="rounded-xl border border-borde bg-panel-alto px-4 py-3.5">
            <LineaJugadas
              linea={refutacion}
              desdePly={puzzle.ply + 1}
              orientacion={orientacion}
              onIr={(paso) =>
                onIr("refutacion", refutacion.pasos.indexOf(paso), paso)
              }
              plyMirado={mirado?.linea === "refutacion" ? mirado.indice : null}
            />
            <p className="mt-2 text-xs text-tenue">
              {refutacion.terminaEnMate ? (
                <>
                  Tu rival da <strong className="text-critico">mate</strong> por
                  la fuerza.
                </>
              ) : material > 0 ? (
                <>
                  Pierdes <strong className="text-critico">{material}</strong>{" "}
                  {material === 1 ? "punto" : "puntos"} de material
                  {refutacion.pasos.find((p) => p.captura && !p.mia)
                    ? `: se lleva ${refutacion.pasos.find((p) => p.captura && !p.mia)?.captura?.nombre}`
                    : ""}
                  .
                </>
              ) : (
                <>
                  No pierde material de inmediato, pero la posición empeora{" "}
                  {(puzzle.cpLoss / 100).toFixed(1)} puntos según el motor.
                </>
              )}
            </p>
          </div>
        </div>
      ) : estadoMotor === "calculando" ? (
        <p className="text-xs text-tenue">
          Calculando cómo te castigaba el rival…
        </p>
      ) : (
        <p className="text-xs text-tenue">
          No se pudo calcular la línea del castigo para esta posición.
        </p>
      )}

      {concepto ? (
        <div className="rounded-xl border border-aviso/30 bg-aviso/[0.07] px-4 py-3">
          <p className="mb-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.11em] text-aviso">
            En qué te equivocaste
          </p>
          <p className="text-[13.5px] leading-relaxed text-texto-suave">
            {concepto.texto}
          </p>
        </div>
      ) : null}

      {solucion && solucion.pasos.length > 0 ? (
        <div>
          <p className="mb-1.5 font-mono text-[10.5px] font-medium tracking-[0.11em] text-tenue">
            <span className="uppercase">Qué lograba</span>{" "}
            <span className="font-mono text-texto">{mejorSan}</span>
          </p>
          <div className="rounded-xl border border-borde bg-panel-alto px-4 py-3.5">
            <LineaJugadas
              linea={solucion}
              desdePly={puzzle.ply}
              orientacion={orientacion}
              onIr={(paso) =>
                onIr("solucion", solucion.pasos.indexOf(paso), paso)
              }
              plyMirado={mirado?.linea === "solucion" ? mirado.indice : null}
            />
            {/* La linea sola no enseña: decia CUAL era la jugada y ni una palabra de que consigue. */}
            {logro ? (
              <p className="mt-2 text-xs text-tenue">
                {logro.tipo === "mate" ? (
                  <>
                    Das <strong className="text-bien">mate</strong> por la
                    fuerza.
                  </>
                ) : logro.tipo === "gana_material" ? (
                  <>
                    Ganas{" "}
                    <strong className="text-bien">
                      {logro.materialGanado}
                    </strong>{" "}
                    {logro.materialGanado === 1 ? "punto" : "puntos"} de
                    material
                    {logro.captura ? `: te llevas el ${logro.captura}` : ""}.
                  </>
                ) : (
                  <>
                    No gana material ni da mate: lo que hace {mejorSan} es{" "}
                    <strong className="text-texto">no permitir</strong> lo de
                    arriba.
                  </>
                )}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Antes este recuadro daba un numero y nada mas. Un numero no ensena: lo que ensena es que
          te hacia el rival, que te falto ver, y que conseguia la buena. Las tres frases salen de
          `lib/puzzles/diagnostico.ts`, de hechos del tablero, ninguna inventada. El numero se
          queda al pie porque es el unico dato calibrado que hay — y se dice como DIFERENCIA, no
          como dos evaluaciones, porque `puzzles` guarda la caida y nunca el valor absoluto. */}
      {frases.length > 0 ? (
        <div className="rounded-xl border border-acento/25 bg-acento/[0.05] px-4 py-3.5">
          <p className="mb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.11em] text-acento">
            Lo que te diría tu entrenador
          </p>
          <div className="space-y-2 text-[13.5px] leading-relaxed text-texto-suave">
            {frases.map((frase, i) => (
              <p key={i}>{frase}</p>
            ))}
          </div>
          {diferencia > 0 ? (
            <p className="mt-2.5 text-[11.5px] text-apagado">
              Entre <span className="font-mono">{mejorSan}</span> y{" "}
              <span className="font-mono">{jugadaSan}</span> hay{" "}
              {diferencia.toFixed(1)} puntos de diferencia según el motor; un
              punto es lo que vale un peón.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-tenue">
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
export type PatronUI = {
  etiqueta: string;
  /** Cuantos intentos fallaste con ese concepto, y en cuantos ejercicios distintos. */
  intentos: number;
  ejercicios: number;
  /** Largo de la barra respecto del concepto que mas repites. No es un porcentaje de acierto. */
  pct: number;
  /**
   * `empeora_la_posicion` es el cajon de "ninguno de los otros" y se lleva tres cuartos de los
   * intentos: se muestra separado, porque presentarlo como un patron mas es nombrar una
   * debilidad que no existe.
   */
  esResiduo: boolean;
  /** La frase que explica el concepto. */
  detalle: string;
};

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
    () =>
      puzzle.solutionLine?.length ? puzzle.solutionLine : [puzzle.bestUci],
    [puzzle.solutionLine, puzzle.bestUci],
  );
  const orientacion =
    puzzle.myColor ?? (puzzle.fen.split(" ")[1] === "b" ? "black" : "white");

  const [game] = useState(() => new Chess(puzzle.fen));
  const [position, setPosition] = useState(puzzle.fen);
  const [paso, setPaso] = useState(0);
  const [estado, setEstado] = useState<Estado>("jugando");
  /** Lo que la app derivo del error, guardado para poder ofrecerlo entre las opciones. */
  const [conceptoCalculado, setConceptoCalculado] = useState<string | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [pistaUsada, setPistaUsada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /**
   * La ultima jugada mala que se probo. Si es distinta del blunder original, la refutacion no
   * esta guardada en la base y hay que pedirsela al motor del navegador: explicar SOLO el error
   * de la partida dejaria sin respuesta "¿y por que estaba mal LA QUE YO probe?".
   */
  const [jugadaProbada, setJugadaProbada] = useState<string | null>(null);
  const [flechas, setFlechas] = useState<
    Array<{ startSquare: string; endSquare: string; color: string }>
  >([]);

  /**
   * La posicion que se esta MIRANDO, distinta de la que se esta jugando.
   *
   * Son dos estados a proposito y no uno. `position` es la partida del ejercicio, que avanza al
   * acertar; `vista` es lo que se dibuja mientras se recorre una linea o mientras corre la
   * animacion de la refutacion. Con un solo estado, la animacion (una cadena de `setTimeout`) y
   * el click en una jugada se pisan y el tablero pelea consigo mismo.
   */
  const [vista, setVista] = useState<{
    fen: string;
    flechas: Array<{ startSquare: string; endSquare: string; color: string }>;
    /** Que jugada de que linea es, para resaltarla en el texto. */
    donde: { linea: "refutacion" | "solucion"; indice: number } | null;
  } | null>(null);

  /**
   * Exploracion libre despues de cerrar el ejercicio: el tablero vuelve a la posicion del puzzle y
   * se puede mover por los DOS bandos para probar las lineas que el panel acaba de nombrar. Sin
   * esto, la explicacion se lee y no se prueba — y probarla es lo que la fija.
   *
   * `null` significa que no se esta explorando; la explicacion se sigue viendo al lado.
   */
  const [exploracion, setExploracion] = useState<{
    fen: string;
    moves: string[];
  } | null>(null);
  const exploradorRef = useRef<Chess | null>(null);
  /**
   * La linea del motor congelada al entrar a explorar. El motor pasa a analizar la posicion que
   * estas mirando, asi que la refutacion que ya calculo hay que guardarla o la explicacion de al
   * lado se quedaria sin ella. Se congela en el manejador del click, no en un efecto.
   */
  const [lineaCongelada, setLineaCongelada] = useState<string[] | null>(null);

  /** Los temporizadores de la animacion, para poder cortarla al tocar una jugada. */
  const temporizadoresRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const limpiarAnimacion = useCallback(() => {
    for (const id of temporizadoresRef.current) clearTimeout(id);
    temporizadoresRef.current = [];
  }, []);
  useEffect(() => limpiarAnimacion, [limpiarAnimacion]);

  // El cronometro arranca al montar, no durante el render: `performance.now()` es impuro y en
  // render puede correr mas de una vez, lo que daria tiempos inventados.
  const iniciadoRef = useRef(0);
  const intentoRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    iniciadoRef.current = performance.now();
  }, []);

  /**
   * El concepto de una jugada mala, con lo que hay a mano y sin esperar al motor: si es el error
   * original se usa su refutacion guardada, y si no, se deriva del tablero igual (patron
   * estructural y caida del motor ya conocida). Se llama en el momento del error para poder
   * guardarlo con el intento.
   */
  const conceptoDeJugada = useCallback(
    (uci: string): string | null => {
      const linea =
        uci === puzzle.playedUci && puzzle.refutationLine?.length
          ? describirLinea(
              fenDespuesDe(puzzle.fen, uci) ?? puzzle.fen,
              puzzle.refutationLine,
              false,
            )
          : null;
      // Primero el diagnostico sobre la linea del rival, que es el que nombra el error de verdad;
      // si no alcanza (sin linea todavia), se cae al reconocedor estructural de siempre.
      const delDiagnostico = diagnosticar({
        fen: puzzle.fen,
        playedUci: uci,
        bestUci: puzzle.bestUci,
        refutacion: linea,
        cpLoss: puzzle.cpLoss,
      })?.concepto;
      if (delDiagnostico) return delDiagnostico;
      return (
        conceptoDelError({
          fen: puzzle.fen,
          playedUci: uci,
          refutacion: linea,
          cpLoss: puzzle.cpLoss,
        })?.tipo ?? null
      );
    },
    [puzzle],
  );

  /**
   * La jugada que se explica: la que probaste si probaste alguna, y si no, el error original de
   * la partida. Al rendirse (`playedUci` vacio) tambien cae al error original.
   */
  const jugadaAExplicar = jugadaProbada ?? puzzle.playedUci;
  const esElErrorOriginal = jugadaAExplicar === puzzle.playedUci;

  /**
   * Cuando hay que pedirle la linea del castigo al motor del navegador. Son DOS casos, no uno:
   *
   *  - la jugada probada no es el blunder original, asi que su refutacion no esta guardada;
   *  - o es el original pero el ejercicio no tiene `refutation_line` (el backfill de
   *    `puzzles:enrich` todavia no lo alcanzo). Antes ese caso no encendia el motor y el panel
   *    simplemente no mostraba la tabla — que es el "a veces aparece y a veces no".
   *
   * Un solo booleano con nombre porque lo usan la condicion del hook Y el estado que se muestra:
   * separados, el panel decia "no se pudo calcular" mientras el motor todavia pensaba.
   */
  const hacenFaltaElMotor =
    !esElErrorOriginal || !puzzle.refutationLine?.length;

  /**
   * Un solo motor, dos trabajos. Mientras se explica, calcula la refutacion de la jugada probada;
   * mientras exploras, analiza la posicion que tienes en pantalla con tres lineas, como en
   * `/partida`. Uno solo y no dos porque cada instancia es un worker con su propia red neuronal.
   */
  const motor = useBrowserEngine({
    fen: puzzle.fen,
    uciMoves: exploracion ? exploracion.moves : [jugadaAExplicar],
    enabled:
      estado !== "jugando" && (exploracion !== null || hacenFaltaElMotor),
    multiPv: exploracion ? 3 : 1,
    depth: exploracion ? 18 : 14,
  });

  // Mientras exploras, el motor ya no esta mirando la refutacion: vale la congelada.
  const lineaDelMotor = exploracion
    ? lineaCongelada
    : (motor.lines[0]?.pv ?? null);

  const explicacion = useMemo(
    () =>
      explicarBlunder({
        fen: puzzle.fen,
        playedUci: jugadaAExplicar,
        bestUci: puzzle.bestUci,
        // La guardada solo sirve para el error original, y solo si existe; si no, la del motor.
        refutationLine: hacenFaltaElMotor
          ? lineaDelMotor
          : puzzle.refutationLine,
        solutionLine: puzzle.solutionLine,
        cpLoss: puzzle.cpLoss,
      }),
    [puzzle, jugadaAExplicar, hacenFaltaElMotor, lineaDelMotor],
  );

  const diagnostico = useMemo(
    () =>
      diagnosticar({
        fen: puzzle.fen,
        playedUci: jugadaAExplicar,
        bestUci: puzzle.bestUci,
        refutacion: explicacion.refutacion,
        cpLoss: puzzle.cpLoss,
      }),
    [
      puzzle.fen,
      puzzle.bestUci,
      puzzle.cpLoss,
      jugadaAExplicar,
      explicacion.refutacion,
    ],
  );

  const estadoMotor: "calculando" | "listo" | "sin-motor" = !hacenFaltaElMotor
    ? "listo"
    : motor.status === "cargando" || motor.status === "pensando"
      ? "calculando"
      : motor.status === "error" || motor.status === "no-soportado"
        ? "sin-motor"
        : "listo";

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
    setVista({
      fen: tablero.fen(),
      flechas: [
        {
          startSquare: puzzle.playedUci.slice(0, 2),
          endSquare: puzzle.playedUci.slice(2, 4),
          color: "#e0604f",
        },
      ],
      donde: null,
    });

    const linea = puzzle.refutationLine ?? [];
    linea.forEach((uci, i) => {
      temporizadoresRef.current.push(
        setTimeout(
          () => {
            if (!jugar(uci)) return;
            setVista({
              fen: tablero.fen(),
              flechas: [
                {
                  startSquare: uci.slice(0, 2),
                  endSquare: uci.slice(2, 4),
                  color: "#e0604f",
                },
              ],
              donde: { linea: "refutacion", indice: i },
            });
          },
          600 * (i + 1),
        ),
      );
    });
  }, [puzzle.fen, puzzle.playedUci, puzzle.refutationLine]);

  /** Llevar el tablero a una jugada de una de las dos lineas. Corta la animacion si corria. */
  const irAPaso = useCallback(
    (linea: "refutacion" | "solucion", indice: number, paso: PasoLinea) => {
      limpiarAnimacion();
      setVista({
        fen: paso.fen,
        flechas: [
          {
            startSquare: paso.desde,
            endSquare: paso.hasta,
            color: linea === "refutacion" ? "#e0604f" : "#199e70",
          },
        ],
        donde: { linea, indice },
      });
    },
    [limpiarAnimacion],
  );

  /**
   * Volver a la posicion del ejercicio. Restaura desde `game.fen()` y NO desde `puzzle.fen`: si
   * se camino la solucion, la partida del ejercicio ya avanzo y no son la misma posicion.
   */
  const volverAlEjercicio = useCallback(() => {
    limpiarAnimacion();
    setVista(null);
    setPosition(game.fen());
  }, [limpiarAnimacion, game]);

  const cerrar = useCallback(
    (resuelto: boolean, playedUci: string, numeroIntento: number) => {
      const concepto = resuelto
        ? null
        : conceptoDeJugada(playedUci || puzzle.playedUci);
      // El intento se guarda AHORA, no cuando se conteste la pregunta: es lo que alimenta SM-2,
      // y cerrar la pestana sin contestar no puede perderlo.
      intentoRef.current = recordAttempt({
        puzzleId: puzzle.id,
        playedUci,
        correct: resuelto,
        msTaken: Math.round(performance.now() - iniciadoRef.current),
        attemptNo: numeroIntento,
        hintUsed: pistaUsada,
        concepto,
        cierra: true,
      });
      if (resuelto) {
        setEstado("resuelto");
        return;
      }
      // Al fallar, primero la pregunta. `mostrarRefutacion` se llama al contestarla, porque
      // revelar la linea es exactamente lo que haria la pregunta inutil.
      setConceptoCalculado(concepto);
      setEstado("preguntando");
    },
    [
      puzzle.id,
      puzzle.playedUci,
      pistaUsada,
      conceptoDeJugada,
    ],
  );

  /** Contestar (o saltarse) la pregunta es lo que revela la respuesta. */
  const responderQuePaso = useCallback(
    (elegido: Concepto | null) => {
      if (elegido !== null) void anotarConceptoElegido(puzzle.id, elegido);
      setEstado("fallado");
      mostrarRefutacion();
    },
    [puzzle.id, mostrarRefutacion],
  );

  /** Entrar a probar las lineas: el tablero vuelve a la posicion del ejercicio y se suelta. */
  const explorar = useCallback(() => {
    limpiarAnimacion();
    setLineaCongelada(motor.lines[0]?.pv ?? puzzle.refutationLine ?? null);
    exploradorRef.current = new Chess(puzzle.fen);
    setExploracion({ fen: puzzle.fen, moves: [] });
    setVista(null);
    setFlechas([]);
  }, [limpiarAnimacion, motor.lines, puzzle.fen, puzzle.refutationLine]);

  const salirDeExploracion = useCallback(() => {
    exploradorRef.current = null;
    setExploracion(null);
  }, []);

  const deshacerExploracion = useCallback(() => {
    const tablero = exploradorRef.current;
    if (!tablero || tablero.history().length === 0) return;
    tablero.undo();
    setExploracion({
      fen: tablero.fen(),
      moves: tablero
        .history({ verbose: true })
        .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`),
    });
  }, []);

  /** Jugar una jugada en la exploracion. La usa tanto arrastrar como elegir una linea del motor. */
  const jugarExplorando = useCallback(
    (from: string, to: string, promotion?: string): boolean => {
      const tablero = exploradorRef.current;
      if (!tablero) return false;
      try {
        tablero.move({ from, to, promotion: promotion ?? "q" });
      } catch {
        return false;
      }
      setExploracion({
        fen: tablero.fen(),
        moves: tablero
          .history({ verbose: true })
          .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`),
      });
      return true;
    },
    [],
  );

  const onPieceDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }): boolean => {
      if (!targetSquare) return false;
      // Explorando se mueve por los DOS bandos y nada se califica: es un tablero de analisis.
      if (exploracion) {
        jugarExplorando(sourceSquare, targetSquare);
        return false;
      }
      if (estado !== "jugando") return false;

      let jugada;
      try {
        jugada = game.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: "q",
        });
      } catch {
        return false;
      }

      const uci = `${jugada.from}${jugada.to}${jugada.promotion ?? ""}`;
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
          // El concepto se deriva aca, en el momento del error, y se guarda con el intento. Es
          // lo que despues permite servir OTRO ejercicio del MISMO concepto en vez de repetir
          // la misma posicion hasta memorizar la respuesta.
          concepto: conceptoDeJugada(uci),
          cierra: false,
        });
        setJugadaProbada(uci);
        setAviso("Esa no. Prueba otra.");
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
          if (solucion[paso + 2] === undefined)
            cerrar(true, uci, numeroIntento);
          else setPaso(paso + 2);
        } catch {
          cerrar(true, uci, numeroIntento);
        }
      }, 400);

      return true;
    },
    [
      estado,
      game,
      solucion,
      paso,
      intentos,
      cerrar,
      puzzle.id,
      pistaUsada,
      conceptoDeJugada,
      exploracion,
      jugarExplorando,
    ],
  );

  /**
   * Volver una jugada atras mientras resuelves. Faltaba: una jugada mala se deshace sola, pero
   * una buena avanzaba la linea sin vuelta, y en un ejercicio de varias jugadas eso deja atrapado.
   *
   * Lo primero es CORTAR los temporizadores: la respuesta del rival entra por un `setTimeout` de
   * 400 ms, y apretar Atras dentro de esa ventana deshacia una jugada que el temporizador estaba
   * por hacer — despues disparaba sobre un tablero ya rebobinado. Es la misma `limpiarAnimacion`
   * que se agrego en la Fase 10 para la animacion de la refutacion.
   */
  const retroceder = useCallback(() => {
    if (estado !== "jugando" || paso === 0) return;
    limpiarAnimacion();
    // Dos medias jugadas: la del rival y la tuya. Si por lo que sea no hay respuesta del rival
    // que quitar, se deshace una sola en vez de rebobinar de mas.
    game.undo();
    if (paso >= 2 && game.history().length > 0) game.undo();
    setPaso(Math.max(0, paso - 2));
    setPosition(game.fen());
    setVista(null);
    setFlechas([]);
    setAviso(null);
  }, [estado, paso, game, limpiarAnimacion]);

  const pedirPista = useCallback(() => {
    const esperada = solucion[paso];
    if (!esperada) return;
    setPistaUsada(true);
    setFlechas([]);
    setAviso(`Mueve la pieza de ${esperada.slice(0, 2)}.`);
  }, [solucion, paso]);

  const rendirse = useCallback(() => {
    cerrar(false, "", intentos + 1);
  }, [cerrar, intentos]);

  // El intento en vuelo se espera antes de refrescar: si no, el servidor puede devolver el
  // MISMO ejercicio porque `due_at` todavia no se actualizo.
  const siguiente = useCallback(() => {
    void (async () => {
      if (intentoRef.current) await intentoRef.current;
      router.refresh();
    })();
  }, [router]);

  // Mientras se mira otra posicion no se arrastra: la jugada iria sobre un tablero que no es el
  // del ejercicio.
  const tocaMover =
    (estado === "jugando" && vista === null) || exploracion !== null;

  /**
   * La evaluacion que muestra la barra mientras exploras. `EvalLine.scoreCp` viene crudo de UCI,
   * en perspectiva del que mueve, y la barra espera perspectiva de blancas: el giro lo hace
   * `toWhitePerspective` y no este componente — es la trampa 2 del proyecto.
   */
  const fenExplorado = exploracion?.fen ?? puzzle.fen;
  const mueveBlancasAhora = fenExplorado.split(" ")[1] !== "b";
  const mejorLinea = motor.lines[0];
  const evaluacion =
    exploracion && mejorLinea
      ? {
          evalCp:
            mejorLinea.scoreCp === null
              ? null
              : toWhitePerspective(
                  mejorLinea.scoreCp,
                  mueveBlancasAhora ? "white" : "black",
                ),
          mateIn:
            mejorLinea.mateIn === null
              ? null
              : toWhitePerspective(
                  mejorLinea.mateIn,
                  mueveBlancasAhora ? "white" : "black",
                ),
        }
      : { evalCp: null, mateIn: null };

  return (
    <div className="grid gap-[26px] lg:grid-cols-[minmax(0,460px)_1fr]">
      <div className="min-w-0">
        <div className="flex items-stretch gap-2.5">
          {/* La barra solo aparece explorando: mientras resuelves seria un spoiler. */}
          {exploracion ? (
            <BarraVentaja
              evalCp={evaluacion.evalCp}
              mateIn={evaluacion.mateIn}
              orientacion={orientacion}
            />
          ) : null}
          <div className="min-w-0 flex-1 overflow-hidden rounded-xl">
            <Chessboard
              options={{
                position: exploracion?.fen ?? vista?.fen ?? position,
                onPieceDrop,
                boardOrientation: orientacion,
                allowDragging: tocaMover,
                arrows: vista?.flechas ?? flechas,
                darkSquareStyle: { backgroundColor: "#769656" },
                lightSquareStyle: { backgroundColor: "#eeeed2" },
              }}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-tenue">
          <Badge tono="acento">
            {orientacion === "white" ? "Juegan blancas" : "Juegan negras"}
          </Badge>
          {puzzle.theme && NOMBRE_THEME[puzzle.theme] ? (
            <Badge>{NOMBRE_THEME[puzzle.theme]}</Badge>
          ) : null}
          {vista ? (
            <Button variante="fantasma" onClick={volverAlEjercicio}>
              Volver a la posición
            </Button>
          ) : null}
          {exploracion ? (
            <>
              <Button variante="fantasma" onClick={deshacerExploracion}>
                ← Deshacer
              </Button>
              <Button variante="fantasma" onClick={explorar}>
                Reiniciar
              </Button>
              <Button variante="fantasma" onClick={salirDeExploracion}>
                Salir
              </Button>
            </>
          ) : null}
          <span className="ml-auto font-mono text-[11.5px] text-apagado">
            {dueCount} pendientes
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        {estado === "jugando" ? (
          <div className="space-y-3">
            <p className="text-sm">
              Encuentra la jugada que se te escapó.
              {solucion.length > 1
                ? " La línea sigue después de la primera jugada."
                : ""}
            </p>
            {aviso ? (
              <p className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">
                {aviso}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-tenue">
                {intentos === 0 ? "Primer intento" : `Intento ${intentos + 1}`}
              </span>
              {paso > 0 && vista === null ? (
                <Button variante="fantasma" onClick={retroceder}>
                  ← Atrás
                </Button>
              ) : null}
              <Button variante="fantasma" onClick={pedirPista}>
                Pista
              </Button>
              <Button variante="fantasma" onClick={rendirse}>
                Ver solución
              </Button>
            </div>
          </div>
        ) : estado === "preguntando" ? (
          <PreguntaQuePaso
            puzzleId={puzzle.id}
            conceptoCalculado={conceptoCalculado}
            onResponder={(elegido) => responderQuePaso(elegido)}
            onSaltar={() => responderQuePaso(null)}
          />
        ) : (
          <>
            {exploracion ? (
              <p className="rounded-xl border border-dashed border-acento/40 bg-acento/[0.06] px-4 py-3 text-[13px] leading-relaxed text-texto-suave">
                Estás probando la posición. Mueve las piezas de los dos bandos
                para ver qué pasa en cada línea; la barra de la izquierda y el
                motor te dicen cómo queda. Nada de esto cuenta como intento.
              </p>
            ) : null}
            <PanelExplicacion
              explicacion={explicacion}
              puzzle={puzzle}
              estado={estado}
              estadoMotor={estadoMotor}
              diagnostico={diagnostico}
              orientacion={orientacion}
              onIr={irAPaso}
              mirado={vista?.donde ?? null}
            />
            {exploracion ? (
              <>
                <EnginePanel
                  status={motor.status}
                  lines={motor.lines}
                  depth={motor.depth}
                  engineName={motor.engineName}
                  fen={exploracion.fen}
                  orientacion={orientacion}
                  encendido
                  onToggle={salirDeExploracion}
                  onElegirLinea={(uci) =>
                    jugarExplorando(
                      uci.slice(0, 2),
                      uci.slice(2, 4),
                      uci.length > 4 ? uci.slice(4) : undefined,
                    )
                  }
                />
              </>
            ) : (
              <Button variante="fantasma" onClick={explorar}>
                Probar las líneas en el tablero →
              </Button>
            )}
            <Button variante="primario" onClick={siguiente}>
              Siguiente ejercicio
            </Button>
          </>
        )}

        {patrones.length > 0 ? (
          <div className="mt-1.5 border-t border-borde pt-3.5">
            <p className="eyebrow mb-1">Los errores que más has repetido</p>
            <p className="mb-2.5 text-[11.5px] leading-relaxed text-apagado">
              Tus intentos fallados agrupados por tipo de error. Es tu historial
              completo, así que un error ya corregido sigue apareciendo. Al lado
              de cada uno va en cuántos ejercicios distintos ocurrió: eso es lo
              que dice si es un patrón o una sola posición que se te atravesó.
            </p>
            <div className="flex flex-col gap-2.5 text-[12.5px]">
              {patrones
                .filter((p) => !p.esResiduo)
                .map((p) => (
                <div key={p.etiqueta}>
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-0 flex-1 truncate text-texto-suave">
                      {p.etiqueta}
                    </span>
                    <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-borde sm:w-24">
                      <span
                        className="block h-full rounded-full bg-acento"
                        style={{ width: `${Math.max(6, Math.round(p.pct))}%` }}
                      />
                    </span>
                    <span className="w-28 shrink-0 text-right font-mono text-[11px] text-apagado">
                      {p.intentos} {p.intentos === 1 ? "vez" : "veces"}
                      {" · "}
                      {p.ejercicios}{" "}
                      {p.ejercicios === 1 ? "ejercicio" : "ejercicios"}
                    </span>
                  </div>
                  {p.detalle ? (
                    <p className="mt-0.5 text-[11.5px] leading-relaxed text-apagado">
                      {p.detalle}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            {/* El residuo va aparte y nombrado como lo que es. Mezclado con los demas ganaba
                siempre, porque acumula todo lo que ningun detector reconocio. */}
            {patrones
              .filter((p) => p.esResiduo)
              .map((p) => (
                <p key={p.etiqueta} className="mt-2.5 text-[11.5px] leading-relaxed text-apagado">
                  Otros {p.intentos} intentos, en {p.ejercicios}{" "}
                  {p.ejercicios === 1 ? "ejercicio" : "ejercicios"}, empeoraron la
                  posición sin que ninguno de los patrones de arriba lo explique.
                  No es un patrón: es lo que queda sin clasificar.
                </p>
              ))}
            <p className="mt-2.5 text-[11px] text-apagado">
              La barra compara cuánto repites cada uno. No hay porcentaje de
              acierto: el que salía antes solo podía valer 0 %, porque el
              concepto del error únicamente se guarda cuando fallas.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
