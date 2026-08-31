/**
 * Parseo del PGN de chess.com.
 *
 * Patron del proyecto (docs/DATA-SOURCES.md seccion 3): `@mliebelt/pgn-parser` para headers,
 * jugadas y relojes, y `chess.js` reproduciendo la secuencia SAN jugada a jugada para validar
 * legalidad y obtener FEN/UCI.
 *
 * NO se llama a `loadPgn`. En chess.js 1.x `loadPgn()`, `move()` y el propio constructor
 * LANZAN excepciones, asi que el try/catch va alrededor del bucle de `chess.move()`, que es
 * el que lanza (trampa 4 de CLAUDE.md).
 */
import { Chess } from 'chess.js';
import { parseGame } from '@mliebelt/pgn-parser';
import { parseClockToMs } from './clock';

export type ParsedMove = {
  /** 1-based, como `moves.ply`. */
  ply: number;
  san: string;
  uci: string;
  /** Reloj restante despues de la jugada, en ms. null si el PGN no trae %clk. */
  clockMs: number | null;
  /** EPD (primeros 4 campos del FEN) DESPUES de la jugada. */
  epdAfter: string;
};

export type ParsedGame = {
  headers: Record<string, string>;
  moves: ParsedMove[];
  /** EPD de cada posicion, empezando por la inicial. Largo = moves.length + 1. */
  epds: string[];
};

/** EPD = los primeros cuatro campos del FEN. chess.js no expone `epd()`. */
export function epdFromFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export class PgnParseError extends Error {
  constructor(
    message: string,
    readonly ply?: number,
  ) {
    super(message);
    this.name = 'PgnParseError';
  }
}

export function parsePgn(pgn: string): ParsedGame {
  const tree = parseGame(pgn);

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree.tags ?? {})) {
    if (typeof value === 'string') headers[key] = value;
    else if (value && typeof value === 'object' && 'value' in value) {
      const inner: unknown = (value as { value: unknown }).value;
      if (typeof inner === 'string') headers[key] = inner;
    }
  }

  const chess = new Chess();
  const moves: ParsedMove[] = [];
  const epds: string[] = [epdFromFen(chess.fen())];

  let ply = 0;
  for (const parsed of tree.moves) {
    const san = parsed.notation.notation;
    if (!san) continue;
    ply += 1;
    try {
      const made = chess.move(san);
      const epdAfter = epdFromFen(chess.fen());
      epds.push(epdAfter);
      moves.push({
        ply,
        san: made.san,
        uci: `${made.from}${made.to}${made.promotion ?? ''}`,
        clockMs: parseClockToMs(parsed.commentDiag?.clk),
        epdAfter,
      });
    } catch (error) {
      throw new PgnParseError(
        `Jugada ilegal o no reproducible en el ply ${ply} ("${san}"): ${
          error instanceof Error ? error.message : String(error)
        }`,
        ply,
      );
    }
  }

  return { headers, moves, epds };
}
