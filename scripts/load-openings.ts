/**
 * `pnpm openings:load`
 *
 * Baja a.tsv..e.tsv de lichess-org/chess-openings (dominio publico), reproduce cada linea con
 * chess.js y guarda los primeros cuatro campos de `fen()` como EPD.
 *
 * Las transposiciones chocan en `openings.epd`, que es UNIQUE: se inserta ordenando por
 * `ply_count` ascendente con `on conflict (epd) do nothing`, para quedarse con la linea mas
 * corta (docs/DATA-SOURCES.md).
 *
 * Uso:
 *   pnpm openings:load                 baja los TSV por HTTPS
 *   pnpm openings:load --from-dir DIR  los lee de un directorio local (util donde la red
 *                                      bloquea raw.githubusercontent.com)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assignOpeningIds, openingRowFromTsv, parseOpeningsTsv } from '@/lib/chess/openings';
import type { OpeningInsert } from '@/lib/ingest/store';
import { batchContext, die } from './lib/context';

const FILES = ['a.tsv', 'b.tsv', 'c.tsv', 'd.tsv', 'e.tsv'] as const;
const BASE_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readSource(file: string, fromDir: string | undefined): Promise<string> {
  if (fromDir) return readFileSync(join(fromDir, file), 'utf8');
  const response = await fetch(`${BASE_URL}/${file}`, {
    headers: { 'User-Agent': 'chessito/1.0' },
  });
  if (!response.ok) {
    throw new Error(`No se pudo bajar ${file}: HTTP ${response.status}`);
  }
  return await response.text();
}

async function main(): Promise<void> {
  const fromDir = arg('--from-dir');
  const { store } = batchContext();
  const startedAt = Date.now();

  const rows: OpeningInsert[] = [];
  let failed = 0;

  for (const file of FILES) {
    const content = await readSource(file, fromDir);
    for (const line of parseOpeningsTsv(content)) {
      try {
        rows.push(openingRowFromTsv(line));
      } catch (error) {
        failed += 1;
        console.error(
          `Linea de apertura ilegible (${line.eco} ${line.name}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  // Ascendente por ply_count: ante una transposicion gana la linea mas corta, tanto para
  // `on conflict (epd) do nothing` como para repartir los ids limpios.
  const ordered = assignOpeningIds(rows);

  const BATCH = 500;
  for (let from = 0; from < ordered.length; from += BATCH) {
    await store.insertOpenings(ordered.slice(from, from + BATCH));
  }

  const total = await store.countOpenings();
  await store.close();

  console.log(
    JSON.stringify({
      lineas_leidas: ordered.length,
      lineas_ilegibles: failed,
      filas_en_openings: total,
      duracion_ms: Date.now() - startedAt,
    }),
  );
}

main().catch(die);
