import { dueCount, nextDuePuzzle, puzzleAt, puzzleStatsByTheme, sessionToday } from '@/lib/data';
import { EmptyState, Pagina } from '@/components/ui';
import { TrainerBoard } from '@/components/TrainerBoard';

export const dynamic = 'force-dynamic';

const NOMBRE_THEME: Record<string, string> = {
  pieza_colgada: 'Pieza colgada',
  mate_pasillo: 'Mate del pasillo',
  permite_horquilla: 'Permite horquilla',
};

/** Cuantos puntos de progreso se dibujan: los de hoy, mas los que quedan, con tope. */
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
  searchParams: Promise<{ partida?: string; ply?: string }>;
}) {
  // `/partida/[id]` enlaza a una posicion concreta; sin esos parametros se sirve la cola normal.
  const { partida, ply } = await searchParams;
  const pedido =
    partida && ply ? { gameId: Number.parseInt(partida, 10), ply: Number.parseInt(ply, 10) } : null;

  const [puzzle, pendientes, porTema, sesion] = await Promise.all([
    // Esta sí se deja fallar: sin ejercicio no hay pagina que mostrar, y un 500 con el error real
    // en los logs es mas util que una pantalla que miente diciendo "no hay ejercicios".
    pedido && Number.isFinite(pedido.gameId) && Number.isFinite(pedido.ply)
      ? puzzleAt(pedido.gameId, pedido.ply).then((p) => p ?? nextDuePuzzle())
      : nextDuePuzzle(),
    adorno(dueCount(), 0),
    adorno(puzzleStatsByTheme(), []),
    adorno(sessionToday(), []),
  ]);

  const patrones = porTema
    .filter((t) => t.intentos >= 3)
    .map((t) => ({
      etiqueta: t.theme ? (NOMBRE_THEME[t.theme] ?? t.theme) : 'Sin patrón',
      pct: (t.aciertos / t.intentos) * 100,
      titulo: `${t.aciertos} de ${t.intentos} al primer intento`,
    }))
    .sort((a, b) => a.pct - b.pct);

  const total = Math.max(sesion.length, Math.min(PUNTOS_SESION, sesion.length + pendientes));

  return (
    <Pagina
      titulo="Entrenador"
      subtitulo={
        <>
          Tus propios blunders, servidos como ejercicios. La jugada correcta es la que el motor
          jugaba en tu lugar. Tienes tres intentos: si fallas, se juega en el tablero la línea con
          la que tu rival te castigaba.
        </>
      }
      actions={
        <div className="min-w-[190px] text-right">
          <p className="eyebrow">Sesión de hoy</p>
          <p className="mt-1.5 text-[20px] font-semibold tabular-nums">
            {sesion.length}
            <span className="text-[14px] font-normal text-apagado"> / {total || '—'}</span>
          </p>
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
        </div>
      }
    >
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
