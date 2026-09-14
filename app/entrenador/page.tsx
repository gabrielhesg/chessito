import { dueCount, nextDuePuzzle } from '@/lib/data';
import { Panel, Vacio } from '@/components/ui';
import { TrainerBoard } from '@/components/TrainerBoard';

export const dynamic = 'force-dynamic';

/**
 * Fase 4: el entrenador. Sirve las posiciones perdidas de Gabriel (blunders reales, filtrados
 * por MultiPV para que la segunda mejor jugada no confunda), en orden de `due_at`
 * (repeticion espaciada SM-2 simplificada, docs/prompts/fase4-entrenador.md).
 */
export default async function EntrenadorPage() {
  const [puzzle, pendientes] = await Promise.all([nextDuePuzzle(), dueCount()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Entrenador</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Tus propios blunders, servidos como ejercicios. La jugada correcta es la que el motor
          jugaba en tu lugar, no la que jugaste tu.
        </p>
      </header>

      <Panel title="Posicion">
        {puzzle ? (
          <TrainerBoard
            key={puzzle.id}
            puzzle={{ id: puzzle.id, fen: puzzle.fen, bestUci: puzzle.best_uci, theme: puzzle.theme }}
            dueCount={pendientes}
          />
        ) : (
          <Vacio>
            No hay ejercicios pendientes por ahora. Vuelve mas tarde, o espera a que corra el
            workflow `puzzles`.
          </Vacio>
        )}
      </Panel>
    </div>
  );
}
