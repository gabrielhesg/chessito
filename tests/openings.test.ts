import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openingId, slug } from '@/lib/chess/slug';
import {
  assignOpeningIds,
  openingRowFromTsv,
  parseOpeningsTsv,
  resolveOpening,
  type OpeningRow,
} from '@/lib/chess/openings';
import { parsePgn } from '@/lib/chess/pgn';
import { loadFixture } from './fixtures';

const SAMPLE = readFileSync(join(process.cwd(), 'tests/fixtures/openings-sample.tsv'), 'utf8');

function sampleIndex(): { rows: OpeningRow[]; byEpd: Map<string, { id: string; plyCount: number }> } {
  const rows = assignOpeningIds(parseOpeningsTsv(SAMPLE).map(openingRowFromTsv));
  const byEpd = new Map<string, { id: string; plyCount: number }>();
  // Ascendente por ply_count, igual que `on conflict (epd) do nothing` en la base.
  for (const row of rows) {
    if (!byEpd.has(row.epd)) byEpd.set(row.epd, { id: row.id, plyCount: row.ply_count });
  }
  return { rows, byEpd };
}

describe('slug', () => {
  it('es determinista y sin tildes', () => {
    expect(slug('Ponziani Opening')).toBe('ponziani-opening');
    expect(slug("Bishop's Opening: Berlin Defense")).toBe('bishop-s-opening-berlin-defense');
    expect(slug('Réti Opening')).toBe('reti-opening');
  });

  it('openingId sigue el formato eco_slug', () => {
    expect(openingId('C44', 'Ponziani Opening')).toBe('C44_ponziani-opening');
    expect(openingId('c44', 'Ponziani Opening')).toBe('C44_ponziani-opening');
  });
});

describe('carga de aperturas', () => {
  it('parsea el TSV de Lichess ignorando el encabezado', () => {
    const lines = parseOpeningsTsv(SAMPLE);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.every((l) => /^[A-E]\d{2}$/.test(l.eco))).toBe(true);
  });

  it('reproduce la linea y guarda el EPD de la posicion final', () => {
    const row = openingRowFromTsv({ eco: 'C44', name: 'Ponziani Opening', pgn: '1. e4 e5 2. Nf3 Nc6 3. c3' });
    expect(row.id).toBe('C44_ponziani-opening');
    expect(row.ply_count).toBe(5);
    // EPD = cuatro campos, sin contadores de jugada.
    expect(row.epd.split(' ')).toHaveLength(4);
    expect(row.epd).toContain(' b ');
  });

  it('los ids son unicos aunque eco y nombre se repitan', () => {
    const rows = assignOpeningIds([
      { id: 'A00_x', eco: 'A00', name: 'X', pgn: '1. a3', epd: 'epd-corto', ply_count: 1 },
      { id: 'A00_x', eco: 'A00', name: 'X', pgn: '1. a3 a6 2. b3', epd: 'epd-largo', ply_count: 3 },
    ]);
    expect(rows[0]?.id).toBe('A00_x'); // la linea mas corta se queda el id limpio
    expect(rows[1]?.id).toMatch(/^A00_x-[0-9a-f]{6}$/);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });
});

describe('resolucion por EPD', () => {
  it('acierta en una linea normal', () => {
    const { byEpd } = sampleIndex();
    const parsed = parsePgn('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 3. c3 Nf6 1-0');
    const match = resolveOpening(parsed.epds, byEpd);
    expect(match).not.toBeNull();
    expect(match?.openingId).toContain('ponziani');
  });

  it('acierta en una TRANSPOSICION, que es lo que el ECO de chess.com no distingue', () => {
    const { byEpd } = sampleIndex();
    const directo = parsePgn('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 3. c3 1-0');
    const transpuesto = parsePgn('[Event "x"]\n\n1. Nf3 Nc6 2. e4 e5 3. c3 1-0');
    const a = resolveOpening(directo.epds, byEpd);
    const b = resolveOpening(transpuesto.epds, byEpd);
    expect(b?.openingId).toBe(a?.openingId);
  });

  it('resuelve el fixture real que llega al Ponziani por transposicion', () => {
    const { byEpd, rows } = sampleIndex();
    const fixture = loadFixture('ponziani-por-transposicion');
    const parsed = parsePgn(fixture.pgn);
    expect(parsed.moves.slice(0, 5).map((m) => m.san).join(' ')).toBe('Nf3 Nc6 e4 e5 c3');
    const match = resolveOpening(parsed.epds, byEpd);
    const name = rows.find((r) => r.id === match?.openingId)?.name;
    expect(name).toContain('Ponziani');
  });

  it('se queda con el match MAS PROFUNDO', () => {
    const byEpd = new Map([
      ['epd-1', { id: 'corto', plyCount: 1 }],
      ['epd-3', { id: 'largo', plyCount: 3 }],
    ]);
    const match = resolveOpening(['inicial', 'epd-1', 'otro', 'epd-3', 'final'], byEpd);
    expect(match).toEqual({ openingId: 'largo', plyCount: 3 });
  });

  it('devuelve null cuando ninguna posicion resuelve', () => {
    expect(resolveOpening(['a', 'b'], new Map())).toBeNull();
  });
});
