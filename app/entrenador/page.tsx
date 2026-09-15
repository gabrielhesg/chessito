import { dueCount, nextDuePuzzle, puzzleStatsByTheme } from '@/lib/data';
import { EmptyState, PageHeader, Panel, Stat } from '@/components/ui';
import { BarrasH, type BarraH } from '@/components/charts/BarrasH';
import { TrainerBoard } from '@/components/TrainerBoard';

export const dynamic = 'force-dynamic';

const NOMBRE_THEME: Record<string, string> = {
  pieza_colgada: 'Pieza colgada',
  mate_pasillo: 'Mate del pasillo',
  permite_horquilla: 'Permite horquilla',
};

/**
 * El entrenador: las posiciones que Gabriel perdio, servidas como ejercicios, en orden de
 * `due_at` (repeticion espaciada SM-2).
 *
 * A diferencia de la Fase 4, esta pagina pasa la fila COMPLETA del ejercicio al tablero. Antes
 * hacia `select('*')` y mandaba cuatro campos: `played_uci`, `cp_loss` y `win_pct_loss` se leian
 * de la base y se tiraban, que es justo el material con el que ahora se explica el error.
 */
export default async function EntrenadorPage() {
  const [puzzle, pendientes, porTema] = await Promise.all([
    nextDuePuzzle(),
    dueCount(),
    puzzleStatsByTheme(),
  ]);

  const barrasTema: BarraH[] = porTema
    .filter((t) => t.intentos >= 3)
    .map((t) => {
      const tasa = (t.aciertos / t.intentos) * 100;
      return {
        etiqueta: t.theme ? (NOMBRE_THEME[t.theme] ?? t.theme) : 'Sin patrón',
        valor: tasa,
        texto: `${tasa.toFixed(0)}%`,
        titulo: `${t.aciertos} de ${t.intentos} al primer intento`,
      };
    })
    .sort((a, b) => a.valor - b.valor);

  return (
    <div className="space-y-6">
      <PageHeader titulo="Entrenador">
        Tus propios blunders, servidos como ejercicios. La jugada correcta es la que el motor
        jugaba en tu lugar. Tienes tres intentos: si fallas, se juega en el tablero la línea con
        la que tu rival te castigaba.
      </PageHeader>

      <Panel title="Posición">
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
          />
        ) : (
          <EmptyState
            titulo="No hay ejercicios pendientes"
            detalle="Vuelve más tarde, o espera a que corra el workflow de ejercicios. Cada blunder tuyo que el motor encuentra se convierte en uno."
          />
        )}
      </Panel>

      {barrasTema.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,320px)]">
          <Panel
            title="En qué patrón tropiezas más"
            subtitle="Aciertos al primer intento, por tipo de error. Los peores primero."
          >
            <BarrasH datos={barrasTema} max={100} referencia={50} etiquetaReferencia="50%" />
          </Panel>
          <Stat
            etiqueta="Ejercicios pendientes"
            valor={pendientes.toLocaleString('es-CL')}
            detalle="vencidos según la repetición espaciada"
          />
        </div>
      ) : null}
    </div>
  );
}
