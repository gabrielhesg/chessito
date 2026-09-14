'use client';

/**
 * El primer componente cliente de la app. Necesita interaccion (arrastrar una pieza, validar la
 * jugada) que un Server Component no puede resolver. `chess.js` valida legalidad contra
 * `puzzle.fen`; la jugada correcta es `puzzle.bestUci` (la mejor jugada, NO `puzzle.playedUci`,
 * que es el blunder que Gabriel realmente jugo).
 *
 * Sin gamificacion, rachas ni notificaciones (docs/prompts/fase4-entrenador.md, ultima linea):
 * solo el ejercicio y el resultado.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { recordAttempt } from '@/lib/spaced-repetition/actions';

export type TrainerPuzzle = {
  id: number;
  fen: string;
  bestUci: string;
  theme: string | null;
};

const NOMBRE_THEME: Record<string, string> = {
  pieza_colgada: 'Pieza colgada',
  mate_pasillo: 'Mate del pasillo',
  permite_horquilla: 'Permite horquilla',
};

export function TrainerBoard({ puzzle, dueCount }: { puzzle: TrainerPuzzle; dueCount: number }) {
  const router = useRouter();
  const [game] = useState(() => new Chess(puzzle.fen));
  const [position, setPosition] = useState(puzzle.fen);
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null);
  const startedAtRef = useRef(0);
  const attemptRef = useRef<Promise<void> | null>(null);

  // Se marca el inicio del intento fuera del render (efecto, no cuerpo del componente): leer el
  // reloj durante el render es impuro y react-hooks/purity lo rechaza.
  useEffect(() => {
    startedAtRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }, [puzzle.id]);

  function onPieceDrop({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }): boolean {
    if (result !== null || !targetSquare) return false;

    let move;
    try {
      move = game.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
    } catch {
      return false;
    }

    const playedUci = `${move.from}${move.to}${move.promotion ?? ''}`;
    const correct = playedUci === puzzle.bestUci;
    setPosition(game.fen());
    setResult(correct ? 'correct' : 'incorrect');

    const msTaken = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAtRef.current);
    attemptRef.current = recordAttempt(puzzle.id, correct, msTaken);
    return true;
  }

  /** Espera a que el intento haya quedado registrado (SM-2 aplicado) antes de pedir el siguiente. */
  async function siguiente(): Promise<void> {
    await attemptRef.current;
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-tenue)]">
        {dueCount} ejercicio{dueCount === 1 ? '' : 's'} pendiente{dueCount === 1 ? '' : 's'}
        {puzzle.theme && NOMBRE_THEME[puzzle.theme] ? ` · ${NOMBRE_THEME[puzzle.theme]}` : ''}
      </p>

      <div className="max-w-[480px]">
        <Chessboard options={{ position, onPieceDrop }} />
      </div>

      {result ? (
        <div className="space-y-2 text-sm">
          <p className={result === 'correct' ? 'text-[var(--color-bien)]' : 'text-[var(--color-mal)]'}>
            {result === 'correct' ? 'Correcto.' : `Incorrecto. La jugada era ${puzzle.bestUci}.`}
          </p>
          <button
            type="button"
            onClick={() => void siguiente()}
            className="rounded border border-[var(--color-borde)] px-3 py-1.5 text-sm hover:bg-[var(--color-panel)]"
          >
            Siguiente
          </button>
        </div>
      ) : null}
    </div>
  );
}
