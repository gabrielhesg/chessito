import {
  conceptosFallados,
  dueCount,
  nextDuePuzzle,
  nextPuzzleDeLaPartida,
  puzzleAt,
  sessionToday,
} from '@/lib/data';
import Link from 'next/link';
import { TEXTO_CONCEPTO, type Concepto } from '@/lib/puzzles/explain';
import { semanaDelCiclo } from '@/lib/ciclo/semana';
import { Ayuda, EmptyState, Pagina } from '@/components/ui';
import { TrainerBoard } from '@/components/TrainerBoard';

export const dynamic = 'force-dynamic';

/**
 * El nombre corto de cada concepto. Estan TODOS, incluidos los viejos: `puzzle_attempts.concepto`
 * guarda miles de filas con los valores anteriores a la Fase 11, y si desaparecieran de aca el
 * panel dibujaria un hueco por cada intento historico. Lo que no reconozca cae al string crudo.
 */
const NOMBRE_CONCEPTO: Record<string, string> = {
  pieza_colgada: 'Dejar una pieza colgada',
  mate_pasillo: 'Mate del pasillo',
  permite_horquilla: 'Permitir una horquilla',
  permite_mate: 'Permitir un mate forzado',
  pierde_material: 'Perder material',
  empeora_la_posicion: 'Empeorar la posición',
  cuelga_la_pieza_movida: 'Mover una pieza a donde te la comen',
  abandonas_la_defensa: 'Mover al defensor de otra pieza',
  no_atiendes_la_amenaza: 'No ver la amenaza del rival',
  permite_una_amenaza: 'Permitir una jugada con amenaza',
};

/** Cuantos puntos de progreso se dibujan como maximo: los de hoy, mas los que quedan. */
const PUNTOS_SESION = 8;

/**
 * Las lecturas de adorno no pueden matar la pagina.
 *
 * `puzzleStatsByTheme` y `sessionToday` piden columnas de `puzzle_attempts` que agrega la
 * migracion 0007 (`attempt_no`, `hint_used`). Contra una base que todavia no la aplico, PostgREST
 * responde 400 y `fail()` lanza — y como las cuatro lecturas iban juntas en un `Promise.all`, la
 * pagina entera se caia con un 500 y pantalla en blanco, aunque el ejercicio en si se pudiera
 * servir perfectamente. El ejercicio ES la pagina; los puntos de sesion y las barras de patron
 * son adorno, y el adorno se cae solo.
 */
async function adorno<T>(lectura: Promise<T>, siFalla: T): Promise<T> {
  try {
    return await lectura;
  } catch (e) {
    console.error('[entrenador] lectura secundaria fallida:', e);
    return siFalla;
  }
}

/**
 * El entrenador: las posiciones que Gabriel perdio, servidas como ejercicios, en orden de
 * `due_at` (repeticion espaciada SM-2).
 *
 * A diferencia de la Fase 4, esta pagina pasa la fila COMPLETA del ejercicio al tablero. Antes
 * hacia `select('*')` y mandaba cuatro campos: `played_uci`, `cp_loss` y `win_pct_loss` se leian
 * de la base y se tiraban, que es justo el material con el que ahora se explica el error.
 */
export default async function EntrenadorPage({
  searchParams,
}: {
  searchParams: Promise<{ partida?: string; ply?: string; tema?: string }>;
}) {
  // Tres formas de llegar, en orden de lo mas especifico a lo mas general:
  //   ?partida=&ply=  una posicion concreta (el link de /partida desde la Fase 6)
  //   ?partida=       la tanda de esa partida: "entrenar los N errores de esta derrota"
  //   ?tema=          la sesion dedicada a un patron
  //   sin nada        la cola dirigida: primero las derrotas de rapida de los ultimos 7 dias
  const { partida, ply, tema } = await searchParams;
  const semana = semanaDelCiclo(new Date());
  const gameId = partida ? Number.parseInt(partida, 10) : NaN;
  const plyPedido = ply ? Number.parseInt(ply, 10) : NaN;

  const [puzzle, pendientes, porTema, sesion] = await Promise.all([
    // Esta sí se deja fallar: sin ejercicio no hay pagina que mostrar, y un 500 con el error real
    // en los logs es mas util que una pantalla que miente diciendo "no hay ejercicios".
    Number.isFinite(gameId) && Number.isFinite(plyPedido)
      ? puzzleAt(gameId, plyPedido).then((p) => p ?? nextDuePuzzle())
      : Number.isFinite(gameId)
        ? nextPuzzleDeLaPartida(gameId).then((p) => p ?? nextDuePuzzle())
        : nextDuePuzzle(tema ?? null, semana?.tema.themes ?? []),
    adorno(dueCount(), 0),
    adorno(conceptosFallados(), []),
    adorno(sessionToday(), []),
  ]);

  // El `n` que decide si el panel se muestra es el de la unidad INDEPENDIENTE: ejercicios
  // distintos, no intentos. 170 intentos sobre 3 ejercicios son 3 observaciones, y presentar eso
  // como "te equivocas 170 veces en esto" nombra una debilidad de caracter sobre una muestra de
  // tres. Es la misma regla del umbral de 20 que el proyecto respeta en todas las tablas, que
  // aqui nunca se habia aplicado.
  const MINIMO_EJERCICIOS = 5;
  const conMuestra = porTema.filter((c) => c.ejercicios >= MINIMO_EJERCICIOS);
  const maximo = Math.max(1, ...conMuestra.map((c) => c.intentos));
  const patrones = conMuestra.map((c) => ({
    etiqueta: NOMBRE_CONCEPTO[c.concepto] ?? c.concepto,
    intentos: c.intentos,
    ejercicios: c.ejercicios,
    // La barra es proporcional al que mas repites, no un porcentaje: un porcentaje suelto sin
    // denominador no dice nada, y eso era justo lo que no se entendia del panel anterior.
    pct: (c.intentos / maximo) * 100,
    esResiduo: c.esResiduo,
    detalle: TEXTO_CONCEPTO[c.concepto as Concepto] ?? '',
  }));

  const total = Math.max(sesion.length, Math.min(PUNTOS_SESION, sesion.length + pendientes));

  // Los chips salen de los patrones que YA tienen muestra suficiente: ofrecer "mate del pasillo"
  // cuando hay dos ejercicios de eso es ofrecer una sesion de dos.
  const chips = conMuestra.slice(0, 5);
  const enTanda = Number.isFinite(gameId) && !Number.isFinite(plyPedido);

  return (
    <Pagina
      titulo="Entrenador"
      subtitulo={
        <>
          Tus propios blunders, servidos como ejercicios. La jugada correcta es la que el motor
          jugaba en tu lugar. Prueba las veces que necesites: al resolver verás por qué esa era la
          mejor, y por qué la tuya perdía.
        </>
      }
      actions={
        // Sin nada resuelto hoy, un "0 / 8" sin contexto no informa: no se dibuja. Aparece
        // recien cuando hay algo que contar.
        sesion.length > 0 ? (
          <div className="w-full max-w-[280px] sm:w-auto">
            <div className="flex items-baseline justify-end gap-2">
              <p className="eyebrow">
                Resueltos hoy
                <Ayuda alinear="der">
                  Verde es al primer intento y sin pista, que es el mismo criterio con el que la
                  repetición espaciada decide cuándo volver a mostrarte el ejercicio. Por eso uno
                  que acertaste al tercer intento sale rojo: la app lo sigue considerando pendiente
                  y te lo va a volver a servir.
                </Ayuda>
              </p>
              <p className="text-[20px] font-semibold leading-none tabular-nums">
                {sesion.filter((e) => e.correct).length}
                <span className="text-[14px] font-normal text-apagado"> / {total}</span>
              </p>
            </div>
            <div className="mt-2 flex justify-end gap-1">
              {Array.from({ length: total }, (_, i) => {
                const hecho = sesion[i];
                return (
                  <span
                    key={i}
                    className={`h-1 w-5 rounded-full ${
                      hecho === undefined ? 'bg-borde' : hecho.correct ? 'bg-bien' : 'bg-critico'
                    }`}
                  />
                );
              })}
            </div>
            {/* La leyenda va VISIBLE, pero compacta: la frase larga estiraba este bloque a lo
                ancho de la cabecera y lo desalineaba del numero y de los puntos. */}
            <div className="mt-1.5 flex items-center justify-end gap-3 text-[11px] text-apagado">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-3 rounded-full bg-bien" />1er intento
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1 w-3 rounded-full bg-critico" />más de uno
              </span>
            </div>
          </div>
        ) : null
      }
    >
      {(chips.length > 0 || enTanda) && puzzle ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {enTanda ? (
            <>
              <span className="text-xs text-tenue">Errores de una sola partida</span>
              <Link
                href="/entrenador"
                className="rounded-lg border border-acento bg-acento/10 px-2.5 py-1 text-xs font-medium text-acento"
              >
                Volver a la cola ✕
              </Link>
            </>
          ) : (
            <>
              <span className="text-xs text-tenue">Sesión de</span>
              <Link
                href="/entrenador"
                aria-current={tema ? undefined : 'true'}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  tema
                    ? 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
                    : 'border-acento bg-acento/10 font-medium text-acento'
                }`}
              >
                todo
              </Link>
              {chips.map((c) => (
                <Link
                  key={c.concepto}
                  href={`/entrenador?tema=${encodeURIComponent(c.concepto)}`}
                  aria-current={tema === c.concepto ? 'true' : undefined}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    tema === c.concepto
                      ? 'border-acento bg-acento/10 font-medium text-acento'
                      : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
                  }`}
                >
                  {NOMBRE_CONCEPTO[c.concepto] ?? c.concepto}
                </Link>
              ))}
            </>
          )}
        </div>
      ) : null}

      {puzzle ? (
        <TrainerBoard
          key={puzzle.id}
          puzzle={{
            id: puzzle.id,
            gameId: puzzle.game_id,
            ply: puzzle.ply,
            fen: puzzle.fen,
            playedUci: puzzle.played_uci,
            bestUci: puzzle.best_uci,
            solutionLine: puzzle.solution_line,
            refutationLine: puzzle.refutation_line,
            cpLoss: puzzle.cp_loss,
            isUnique: puzzle.is_unique,
            secondBestUci: puzzle.second_best_uci,
            theme: puzzle.theme,
            myColor: puzzle.my_color,
          }}
          dueCount={pendientes}
          patrones={patrones}
        />
      ) : (
        <EmptyState
          titulo="No hay ejercicios pendientes"
          detalle="Vuelve más tarde, o espera a que corra el workflow de ejercicios. Cada blunder tuyo que el motor encuentra se convierte en uno."
        />
      )}
    </Pagina>
  );
}
