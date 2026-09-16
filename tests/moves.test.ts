import { describe, expect, it } from 'vitest';
import { buildMoveRows } from '@/lib/chess/moves';
import { classifyPhase, isBookMove } from '@/lib/chess/phase';
import { loadFixture } from './fixtures';

describe('buildMoveRows', () => {
  it('no produce move_time_ms negativo, ni en la con incremento ni en la sin incremento', () => {
    for (const name of ['rapid-15-10-con-clk', 'rapid-10-0-sin-incremento'] as const) {
      const fixture = loadFixture(name);
      const rows = buildMoveRows({
        pgn: fixture.pgn,
        myColor: fixture.expected.my_color,
        baseSeconds: fixture.expected.base_seconds,
        incrementSecs: fixture.expected.increment_secs,
        openingPlyCount: 0,
      });
      for (const row of rows) {
        if (row.move_time_ms !== null) expect(row.move_time_ms).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('reconstruye base_seconds sumando move_time_ms, el reloj final y restando los incrementos ganados (15+10)', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    const rows = buildMoveRows({
      pgn: fixture.pgn,
      myColor: fixture.expected.my_color,
      baseSeconds: fixture.expected.base_seconds,
      incrementSecs: fixture.expected.increment_secs,
      openingPlyCount: 0,
    });
    const mine = rows.filter((row) => row.is_mine);
    const sumUsed = mine.reduce((acc, row) => acc + (row.move_time_ms ?? 0), 0);
    const lastClock = mine.at(-1)?.clock_ms ?? 0;
    const incrementMs = fixture.expected.increment_secs * 1000;
    const reconstructed = sumUsed + lastClock - mine.length * incrementMs;
    // %clk viene truncado a decisegundos y el clampeo a 0 puede acumular hasta ~100ms por
    // jugada rapida; con ~44 jugadas de un bando, una tolerancia de 2s cubre el truncamiento
    // sin ocultar un error real de signo o de indice (que desvia varios segundos completos).
    expect(Math.abs(reconstructed - fixture.expected.base_seconds * 1000)).toBeLessThan(2000);
  });

  it('is_mine alterna segun el color: blancas juega los plies impares, negras los pares', () => {
    const fixture = loadFixture('rapid-15-10-con-clk'); // my_color: black
    const rows = buildMoveRows({
      pgn: fixture.pgn,
      myColor: fixture.expected.my_color,
      baseSeconds: fixture.expected.base_seconds,
      incrementSecs: fixture.expected.increment_secs,
      openingPlyCount: 0,
    });
    for (const row of rows) {
      expect(row.is_mine).toBe(row.ply % 2 === 0);
    }
  });

  it('la correspondencia sin %clk deja move_time_ms en null, no en 0', () => {
    const fixture = loadFixture('sin-reloj-vs-coach');
    const rows = buildMoveRows({
      pgn: fixture.pgn,
      myColor: fixture.expected.my_color,
      baseSeconds: fixture.expected.base_seconds,
      incrementSecs: fixture.expected.increment_secs,
      openingPlyCount: 0,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.clock_ms).toBeNull();
      expect(row.move_time_ms).toBeNull();
    }
  });
});

describe('isBookMove', () => {
  it('es libro solo hasta el ply_count de la apertura resuelta', () => {
    expect(isBookMove(4, 6)).toBe(true);
    expect(isBookMove(6, 6)).toBe(true);
    expect(isBookMove(7, 6)).toBe(false);
    expect(isBookMove(1, 0)).toBe(false);
  });
});

describe('classifyPhase', () => {
  /** D + 2T + 2A + 2C = 9 + 10 + 6 + 6 = 31 por bando. */
  const materialInicial = { white: 31, black: 31 };

  it('fase 0 mientras dure la apertura reconocida, aunque pase el ply 20', () => {
    expect(classifyPhase({ ply: 24, openingPlyCount: 26, materialAfter: materialInicial })).toBe(0);
  });

  it('fase 0 hasta el ply 20 aunque la apertura reconocida sea mas corta', () => {
    expect(classifyPhase({ ply: 12, openingPlyCount: 6, materialAfter: materialInicial })).toBe(0);
    expect(classifyPhase({ ply: 20, openingPlyCount: 6, materialAfter: materialInicial })).toBe(0);
  });

  it('fase 1 (medio juego) pasado el limite de apertura, con material completo', () => {
    expect(classifyPhase({ ply: 22, openingPlyCount: 6, materialAfter: materialInicial })).toBe(1);
  });

  it('un solo cambio de piezas por bando NO convierte la partida en un final', () => {
    // Es exactamente el caso que rompia el criterio viejo (<=6 piezas por bando): cambiar un
    // caballo dejaba 6 y 6 y la partida pasaba a "final" en la jugada 12.
    const trasCambiarCaballos = { white: 28, black: 28 };
    expect(classifyPhase({ ply: 24, openingPlyCount: 6, materialAfter: trasCambiarCaballos })).toBe(1);
  });

  it('torre y pieza menor por bando siguen siendo medio juego', () => {
    // 5 + 3 = 8 por bando, 16 en total: sobre el umbral de 13.
    expect(classifyPhase({ ply: 40, openingPlyCount: 6, materialAfter: { white: 8, black: 8 } })).toBe(1);
  });

  it('fase 2 (final) cuando el material no-peon de los DOS bandos suma 13 o menos', () => {
    // Torre contra torre: 5 + 5 = 10.
    expect(classifyPhase({ ply: 40, openingPlyCount: 6, materialAfter: { white: 5, black: 5 } })).toBe(2);
    // Torre y alfil contra torre: 8 + 5 = 13, justo en el umbral.
    expect(classifyPhase({ ply: 40, openingPlyCount: 6, materialAfter: { white: 8, black: 5 } })).toBe(2);
    // Un punto mas y todavia no es final: 9 + 5 = 14.
    expect(classifyPhase({ ply: 40, openingPlyCount: 6, materialAfter: { white: 9, black: 5 } })).toBe(1);
    // Reyes y peones: 0.
    expect(classifyPhase({ ply: 60, openingPlyCount: 6, materialAfter: { white: 0, black: 0 } })).toBe(2);
  });

  it('damas todavia en el tablero no es final, aunque queden pocas piezas', () => {
    // Dama contra dama: 9 + 9 = 18.
    expect(classifyPhase({ ply: 40, openingPlyCount: 6, materialAfter: { white: 9, black: 9 } })).toBe(1);
  });
});
