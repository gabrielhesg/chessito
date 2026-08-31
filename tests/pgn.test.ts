import { describe, expect, it } from 'vitest';
import { parsePgn, epdFromFen, PgnParseError } from '@/lib/chess/pgn';
import { moveTimesMs, parseClockToMs } from '@/lib/chess/clock';
import { parseTimeControl } from '@/lib/chess/timecontrol';
import { allFixtures, loadFixture } from './fixtures';

describe('parsePgn sobre PGNs reales de chess.com', () => {
  for (const fixture of allFixtures()) {
    it(`reproduce ${fixture.name} jugada a jugada`, () => {
      const parsed = parsePgn(fixture.pgn);
      expect(parsed.moves.length).toBe(fixture.expected.ply_count);
      // epds incluye la posicion inicial
      expect(parsed.epds.length).toBe(parsed.moves.length + 1);
      expect(parsed.headers['Link']).toContain('chess.com');
      const clocks = parsed.moves.filter((m) => m.clockMs !== null);
      expect(clocks.length).toBe(fixture.expected.n_clocks);
      if (fixture.expected.first_clock_ms !== null) {
        expect(parsed.moves[0]?.clockMs).toBe(fixture.expected.first_clock_ms);
        expect(parsed.moves.at(-1)?.clockMs).toBe(fixture.expected.last_clock_ms);
      }
    });
  }

  it('la partida sin %clk parsea igual, con clockMs en null', () => {
    const fixture = loadFixture('sin-reloj-vs-coach');
    const parsed = parsePgn(fixture.pgn);
    expect(parsed.moves.length).toBeGreaterThan(0);
    expect(parsed.moves.every((m) => m.clockMs === null)).toBe(true);
  });

  it('lanza PgnParseError con el ply cuando la jugada es ilegal', () => {
    const pgn = '[Event "x"]\n\n1. e4 e5 2. Qxd8 1-0';
    expect(() => parsePgn(pgn)).toThrow(PgnParseError);
    try {
      parsePgn(pgn);
    } catch (error) {
      expect(error).toBeInstanceOf(PgnParseError);
      expect((error as PgnParseError).ply).toBe(3);
    }
  });

  it('epdFromFen se queda con los primeros cuatro campos', () => {
    expect(epdFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    );
  });
});

describe('reloj: la trampa del incremento', () => {
  it('parseClockToMs entiende el formato de chess.com', () => {
    expect(parseClockToMs('0:14:52.3')).toBe(892300);
    expect(parseClockToMs('1:02:03')).toBe(3723000);
    expect(parseClockToMs(undefined)).toBeNull();
    expect(parseClockToMs('no es un reloj')).toBeNull();
  });

  for (const fixture of allFixtures().filter((f) => f.expected.has_clk)) {
    it(`calcula los tiempos de ${fixture.name} igual que el valor congelado`, () => {
      const parsed = parsePgn(fixture.pgn);
      const tc = parseTimeControl(fixture.expected.time_control);
      const times = moveTimesMs({
        clocksMs: parsed.moves.map((m) => m.clockMs),
        baseSeconds: tc.baseSeconds,
        incrementSecs: tc.incrementSecs,
      });
      expect(times.slice(0, 6)).toEqual(fixture.expected.move_times_ms_first_6);
      expect(Math.max(...times.map((t) => t ?? 0))).toBe(fixture.expected.max_move_time_ms);
      expect(Math.min(...times.map((t) => t ?? 0))).toBe(fixture.expected.min_move_time_ms);
      // Invariante `tiempos_de_jugada_negativos` de v_data_quality.
      expect(times.every((t) => t === null || t >= 0)).toBe(true);
    });
  }

  it('los plies 1 y 2 usan base_seconds como reloj previo', () => {
    // 15+10: blancas juegan instantaneo y su reloj SUBE a 15:10.
    const times = moveTimesMs({
      clocksMs: [910_000, 909_000],
      baseSeconds: 900,
      incrementSecs: 10,
    });
    expect(times[0]).toBe(0); // 900000 - 910000 + 10000 = 0
    expect(times[1]).toBe(1000); // 900000 - 909000 + 10000
  });

  it('diferencia contra el ply n-2, no contra el anterior', () => {
    const times = moveTimesMs({
      clocksMs: [59_000, 58_000, 55_000, 30_000],
      baseSeconds: 60,
      incrementSecs: 0,
    });
    // ply 3 es de blancas: 59000 - 55000
    expect(times[2]).toBe(4000);
    // ply 4 es de negras: 58000 - 30000
    expect(times[3]).toBe(28000);
  });

  it('clampea a 0 el truncamiento a decisegundos en vez de tratarlo como error', () => {
    // %clk viene con una cifra decimal: una jugada instantanea puede dar -100 ms legitimos.
    const times = moveTimesMs({ clocksMs: [60_100], baseSeconds: 60, incrementSecs: 0 });
    expect(times[0]).toBe(0);
  });

  it('sin %clk devuelve null y no cero', () => {
    const times = moveTimesMs({ clocksMs: [null, null], baseSeconds: 600, incrementSecs: 0 });
    expect(times).toEqual([null, null]);
  });
});

describe('parseTimeControl', () => {
  it('entiende los tres formatos reales mas el sin reloj', () => {
    expect(parseTimeControl('600')).toEqual({
      baseSeconds: 600,
      incrementSecs: 0,
      isCorrespondence: false,
    });
    expect(parseTimeControl('900+10')).toEqual({
      baseSeconds: 900,
      incrementSecs: 10,
      isCorrespondence: false,
    });
    expect(parseTimeControl('1/86400')).toEqual({
      baseSeconds: 86400,
      incrementSecs: 0,
      isCorrespondence: true,
    });
    expect(parseTimeControl('-')).toEqual({
      baseSeconds: 0,
      incrementSecs: 0,
      isCorrespondence: true,
    });
  });

  it('falla ruidosamente con un formato desconocido', () => {
    expect(() => parseTimeControl('quince minutos')).toThrow(/time_control no reconocido/);
  });

  for (const fixture of allFixtures()) {
    it(`coincide con el valor congelado de ${fixture.name}`, () => {
      const tc = parseTimeControl(fixture.expected.time_control);
      expect(tc.baseSeconds).toBe(fixture.expected.base_seconds);
      expect(tc.incrementSecs).toBe(fixture.expected.increment_secs);
      expect(tc.isCorrespondence).toBe(fixture.expected.is_correspondence);
    });
  }
});
