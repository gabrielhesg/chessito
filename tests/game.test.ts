import { describe, expect, it } from 'vitest';
import { GameMappingError, mapGame, resultFromTermination, scoreOf } from '@/lib/chess/game';
import { allFixtures, loadFixture, USERNAME } from './fixtures';

const NO_OPENINGS = new Map<string, { id: string; plyCount: number }>();

describe('mapGame sobre partidas reales', () => {
  for (const fixture of allFixtures()) {
    it(`mapea ${fixture.name} igual que el valor congelado`, () => {
      const row = mapGame(fixture.game, { username: USERNAME, openingsByEpd: NO_OPENINGS });
      const expected = fixture.expected;
      expect(row.chesscom_uuid).toBe(expected.chesscom_uuid);
      expect(row.my_color).toBe(expected.my_color);
      expect(row.result).toBe(expected.result);
      expect(row.score).toBe(expected.score);
      expect(row.opp_username).toBe(expected.opp_username);
      expect(row.base_seconds).toBe(expected.base_seconds);
      expect(row.increment_secs).toBe(expected.increment_secs);
      expect(row.analysis_state).toBe(expected.analysis_state);
      expect(row.ply_count).toBe(expected.ply_count);
      // termination guarda el resultado de Gabriel, NO el del rival.
      expect(row.termination).toBe(expected.termination);
    });
  }

  it('la partida ganada por tiempo guarda MI resultado y no el del rival', () => {
    const fixture = loadFixture('ganada-por-tiempo');
    const row = mapGame(fixture.game, { username: USERNAME, openingsByEpd: NO_OPENINGS });
    const rivalSide =
      fixture.game.white.username.toLowerCase() === USERNAME ? fixture.game.black : fixture.game.white;
    expect(rivalSide.result).toBe('timeout');
    expect(row.termination).toBe('win');
    expect(row.result).toBe('win');
  });

  it('la correspondencia se ingiere pero queda fuera del analisis', () => {
    const fixture = loadFixture('correspondencia-1-259200');
    const row = mapGame(fixture.game, { username: USERNAME, openingsByEpd: NO_OPENINGS });
    expect(row.analysis_state).toBe('skipped');
    expect(row.base_seconds).toBe(259200);
    expect(row.pgn.length).toBeGreaterThan(0);
  });

  it('guarda la accuracy de chess.com cuando viene, y null cuando no', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    const conAccuracy = mapGame(
      { ...fixture.game, accuracies: { white: 91.2, black: 77.5 } },
      { username: USERNAME, openingsByEpd: NO_OPENINGS },
    );
    const esperada = fixture.expected.my_color === 'white' ? 91.2 : 77.5;
    expect(conAccuracy.my_accuracy).toBe(esperada);

    const sinAccuracy = mapGame(
      { ...fixture.game, accuracies: undefined },
      { username: USERNAME, openingsByEpd: NO_OPENINGS },
    );
    expect(sinAccuracy.my_accuracy).toBeNull();
  });

  it('guarda aparte el ECO del header y la URL del JSON', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    const row = mapGame(fixture.game, { username: USERNAME, openingsByEpd: NO_OPENINGS });
    expect(row.opening_eco_cc).toMatch(/^[A-E]\d{2}$/);
    expect(row.opening_url_cc).toContain('chess.com');
  });

  it('no le importa la capitalizacion del usuario', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    const row = mapGame(fixture.game, { username: 'GaBrIeLhEsG', openingsByEpd: NO_OPENINGS });
    expect(row.my_color).toBe(fixture.expected.my_color);
  });

  it('falla con mensaje claro si la partida no es del usuario o no trae PGN', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    expect(() => mapGame(fixture.game, { username: 'otro', openingsByEpd: NO_OPENINGS })).toThrow(
      GameMappingError,
    );
    expect(() =>
      mapGame({ ...fixture.game, pgn: '' }, { username: USERNAME, openingsByEpd: NO_OPENINGS }),
    ).toThrow(/no trae PGN/);
  });
});

describe('resultado y score', () => {
  it('traduce el enum de chess.com a win/loss/draw', () => {
    expect(resultFromTermination('win')).toBe('win');
    expect(resultFromTermination('agreed')).toBe('draw');
    expect(resultFromTermination('repetition')).toBe('draw');
    expect(resultFromTermination('stalemate')).toBe('draw');
    expect(resultFromTermination('insufficient')).toBe('draw');
    expect(resultFromTermination('50move')).toBe('draw');
    expect(resultFromTermination('timevsinsufficient')).toBe('draw');
    expect(resultFromTermination('checkmated')).toBe('loss');
    expect(resultFromTermination('timeout')).toBe('loss');
    expect(resultFromTermination('resigned')).toBe('loss');
    expect(resultFromTermination('abandoned')).toBe('loss');
  });

  it('el score respeta el check games_score_valid', () => {
    expect(scoreOf('win')).toBe(1);
    expect(scoreOf('draw')).toBe(0.5);
    expect(scoreOf('loss')).toBe(0);
  });
});
