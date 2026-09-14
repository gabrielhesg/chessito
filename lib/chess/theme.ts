/**
 * Deteccion best-effort del patron de un blunder, para etiquetar `puzzles.theme`
 * (docs/prompts/fase4-entrenador.md, punto 5: "cuando se pueda inferir").
 *
 * Solo 3 de los 4 patrones sugeridos: `pieza_colgada`, `mate_pasillo`, `permite_horquilla`.
 * `clavada` (pin) queda sin implementar a proposito: chess.js no expone si una pieza esta
 * clavada, y un detector confiable con la posicion sola (sin volver a llamar al motor) no vale
 * el tiempo para un heuristico opcional. Un ejercicio sin theme se sigue sirviendo igual, solo
 * que no aparece agrupado bajo ningun patron.
 *
 * Todo esto es estructural sobre el tablero DESPUES del blunder, sin volver a llamar a
 * Stockfish: no sabemos cual iba a ser la respuesta real del rival, asi que se busca si la
 * posicion ya deja una pieza sin cubrir o un caballo con casilla de horquilla disponible.
 */
import { Chess, type Square } from 'chess.js';

export type Theme = 'pieza_colgada' | 'mate_pasillo' | 'permite_horquilla';

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const KNIGHT_OFFSETS: [number, number][] = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

function squareOf(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[file]}${rank}` as Square;
}

function fileRankOf(square: Square): { file: number; rank: number } {
  return { file: FILES.indexOf(square[0] as string), rank: Number.parseInt(square[1] as string, 10) };
}

function knightTargets(square: Square): Square[] {
  const { file, rank } = fileRankOf(square);
  return KNIGHT_OFFSETS.map(([df, dr]) => squareOf(file + df, rank + dr)).filter(
    (s): s is Square => s !== null,
  );
}

/** Una pieza (caballo/alfil/torre/dama) propia con mas atacantes rivales que defensores propios. */
function detectHangingPiece(chess: Chess, victimColor: 'w' | 'b'): boolean {
  const attackerColor = victimColor === 'w' ? 'b' : 'w';
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== victimColor) continue;
      if ((PIECE_VALUE[cell.type] ?? 0) < 3) continue;
      const attackers = chess.attackers(cell.square, attackerColor);
      if (attackers.length === 0) continue;
      const defenders = chess.attackers(cell.square, victimColor);
      if (attackers.length > defenders.length) return true;
    }
  }
  return false;
}

/** Un caballo rival que, moviendose una vez, ataca dos o mas piezas valiosas (o el rey) a la vez. */
function detectKnightFork(chess: Chess, victimColor: 'w' | 'b'): boolean {
  const attackerColor = victimColor === 'w' ? 'b' : 'w';
  const knightSquares = chess.findPiece({ type: 'n', color: attackerColor });
  for (const from of knightSquares) {
    for (const target of knightTargets(from)) {
      if (chess.get(target)?.color === attackerColor) continue; // no aterriza en pieza propia
      let hits = 0;
      for (const victimSquare of knightTargets(target)) {
        const piece = chess.get(victimSquare);
        if (piece && piece.color === victimColor && ((PIECE_VALUE[piece.type] ?? 0) >= 3 || piece.type === 'k')) {
          hits += 1;
        }
      }
      if (hits >= 2) return true;
    }
  }
  return false;
}

/** Rey propio en la ultima fila con las tres casillas de escape bloqueadas por piezas propias. */
function detectBackRankPattern(chess: Chess, mover: 'w' | 'b'): boolean {
  const kingSquares = chess.findPiece({ type: 'k', color: mover });
  const kingSquare = kingSquares[0];
  if (!kingSquare) return false;

  const { file, rank } = fileRankOf(kingSquare);
  const homeRank = mover === 'w' ? 1 : 8;
  if (rank !== homeRank) return false;

  const escapeRank = mover === 'w' ? rank + 1 : rank - 1;
  const escapeSquares = [file - 1, file, file + 1]
    .map((f) => squareOf(f, escapeRank))
    .filter((s): s is Square => s !== null);
  if (escapeSquares.length === 0) return false;

  return escapeSquares.every((square) => chess.get(square)?.color === mover);
}

/**
 * `fenBefore` es la posicion ANTES del blunder (la que va en `puzzles.fen`), `playedUci` es la
 * jugada que Gabriel jugo, y `mateIn` el `moves.mate_in` ya normalizado a perspectiva de
 * blancas (puede venir en cualquier perspectiva de blancas: se compara solo su magnitud).
 */
export function inferTheme(input: { fenBefore: string; playedUci: string; mateIn: number | null }): Theme | null {
  const chess = new Chess(input.fenBefore);
  const mover = chess.turn();
  const from = input.playedUci.slice(0, 2) as Square;
  const to = input.playedUci.slice(2, 4) as Square;
  const promotion = input.playedUci.length > 4 ? input.playedUci.slice(4) : undefined;

  try {
    chess.move({ from, to, promotion });
  } catch {
    return null;
  }

  if (input.mateIn !== null && Math.abs(input.mateIn) <= 4 && detectBackRankPattern(chess, mover)) {
    return 'mate_pasillo';
  }
  if (detectHangingPiece(chess, mover)) return 'pieza_colgada';
  if (detectKnightFork(chess, mover)) return 'permite_horquilla';
  return null;
}
