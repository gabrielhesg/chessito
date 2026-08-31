/**
 * Resolucion de apertura por EPD (trampa 3 de CLAUDE.md).
 *
 * El ECO de chess.com es demasiado grueso: `C44` mete en la misma bolsa el Ponziani, el
 * Gambito Escoces y el Gambito Goring. Se resuelve contra los EPD de las aperturas de Lichess
 * quedandose con el match MAS PROFUNDO, que es lo unico que distingue una linea de otra y lo
 * unico que sobrevive a una transposicion.
 */
import { createHash } from 'node:crypto';
import { Chess } from 'chess.js';
import { epdFromFen } from './pgn';
import { openingId } from './slug';

export type OpeningRow = {
  id: string;
  eco: string;
  name: string;
  pgn: string;
  epd: string;
  ply_count: number;
};

export type OpeningMatch = {
  openingId: string;
  /** Plies de libro: hasta aca la partida sigue una linea reconocida. */
  plyCount: number;
};

/**
 * Dado el EPD de cada posicion de la partida (indice 0 = posicion inicial) y un mapa
 * epd -> {id, plyCount}, devuelve el match mas profundo, o null si ninguno resuelve.
 */
export function resolveOpening(
  epds: readonly string[],
  byEpd: ReadonlyMap<string, { id: string; plyCount: number }>,
): OpeningMatch | null {
  let best: OpeningMatch | null = null;
  // Se recorre desde la posicion mas profunda hacia atras: el primer acierto ya es el mejor.
  for (let index = epds.length - 1; index >= 1; index -= 1) {
    const epd = epds[index];
    if (epd === undefined) continue;
    const hit = byEpd.get(epd);
    if (hit) {
      best = { openingId: hit.id, plyCount: index };
      break;
    }
  }
  return best;
}

export type TsvLine = { eco: string; name: string; pgn: string };

/** Parsea un a.tsv..e.tsv de lichess-org/chess-openings (eco \t name \t pgn, con encabezado). */
export function parseOpeningsTsv(content: string): TsvLine[] {
  const out: TsvLine[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trimEnd();
    if (!line) continue;
    const [eco, name, pgn] = line.split('\t');
    if (!eco || !name || !pgn) continue;
    if (eco === 'eco') continue; // encabezado
    out.push({ eco, name, pgn });
  }
  return out;
}

/**
 * Reproduce la linea de una apertura y devuelve la fila lista para insertar.
 * El EPD son los primeros cuatro campos de `fen()`, porque chess.js no expone `epd()`.
 */
export function openingRowFromTsv(line: TsvLine): OpeningRow {
  const chess = new Chess();
  let plyCount = 0;
  for (const token of line.pgn.split(/\s+/)) {
    if (!token) continue;
    if (/^\d+\.(\.\.)?$/.test(token)) continue; // "1." o "1..."
    const san = token.replace(/^\d+\.(\.\.)?/, '');
    if (!san) continue;
    chess.move(san);
    plyCount += 1;
  }
  return {
    id: openingId(line.eco, line.name),
    eco: line.eco,
    name: line.name,
    pgn: line.pgn,
    epd: epdFromFen(chess.fen()),
    ply_count: plyCount,
  };
}

/**
 * Desambiguacion de ids.
 *
 * `eco + '_' + slug(name)` NO es unico en los TSV de Lichess: 253 pares (eco, nombre) aparecen
 * en varias lineas distintas, con EPD distinto (por ejemplo el Gambito Kadas, que tiene tres).
 * Como `openings.id` es la clave primaria y `openings.epd` es UNIQUE, hay que quedarse con las
 * dos cosas: un id legible y una fila por EPD.
 *
 * Regla: la linea MAS CORTA de cada (eco, nombre) se queda con el id limpio; las demas llevan
 * un sufijo de seis hex del EPD, que es unico y estable. Ordenar por (ply_count, epd) hace que
 * el resultado no dependa del orden de lectura de los archivos.
 */
export function assignOpeningIds(rows: readonly OpeningRow[]): OpeningRow[] {
  const sorted = [...rows].sort((a, b) => a.ply_count - b.ply_count || a.epd.localeCompare(b.epd));
  const taken = new Set<string>();
  return sorted.map((row) => {
    if (!taken.has(row.id)) {
      taken.add(row.id);
      return row;
    }
    const suffix = createHash('sha1').update(row.epd).digest('hex').slice(0, 6);
    const id = `${row.id}-${suffix}`;
    taken.add(id);
    return { ...row, id };
  });
}
