import { describe, expect, it } from 'vitest';
import { inferTheme } from '@/lib/chess/theme';

describe('inferTheme', () => {
  it('pieza_colgada: el caballo aterriza en una casilla con mas atacantes que defensores', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/7r/3N4/4K3 w - - 0 1',
      playedUci: 'd2f3',
      mateIn: null,
    });
    expect(theme).toBe('pieza_colgada');
  });

  it('pieza_colgada: no se marca si la pieza retrocede a una casilla sin atacantes', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/7r/3N4/4K3 w - - 0 1',
      playedUci: 'd2b1',
      mateIn: null,
    });
    expect(theme).toBeNull();
  });

  it('permite_horquilla: el caballo rival puede saltar a una casilla que ataca rey y torre', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/2n5/P7/2R3K1 w - - 0 1',
      playedUci: 'a2a3',
      mateIn: null,
    });
    expect(theme).toBe('permite_horquilla');
  });

  it('permite_horquilla: no se marca si el caballo rival esta lejos de cualquier horquilla', () => {
    const theme = inferTheme({
      fenBefore: '4k3/n7/8/8/8/8/P7/2R3K1 w - - 0 1',
      playedUci: 'a2a3',
      mateIn: null,
    });
    expect(theme).toBeNull();
  });

  it('mate_pasillo: rey en la ultima fila con las tres casillas de escape tapadas por peones propios', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/8/5PPP/Q5K1 w - - 0 1',
      playedUci: 'a1b1',
      mateIn: -3,
    });
    expect(theme).toBe('mate_pasillo');
  });

  it('mate_pasillo: no se marca si falta mateIn aunque el patron geometrico este', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/8/5PPP/Q5K1 w - - 0 1',
      playedUci: 'a1b1',
      mateIn: null,
    });
    expect(theme).toBeNull();
  });

  it('mate_pasillo: no se marca si una casilla de escape esta libre', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/8/6PP/Q5K1 w - - 0 1',
      playedUci: 'a1b1',
      mateIn: -3,
    });
    expect(theme).toBeNull();
  });

  it('devuelve null cuando ningun patron aplica', () => {
    const theme = inferTheme({
      fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      playedUci: 'g8f6',
      mateIn: null,
    });
    expect(theme).toBeNull();
  });

  it('devuelve null si playedUci no es una jugada legal desde fenBefore', () => {
    const theme = inferTheme({
      fenBefore: '4k3/8/8/8/8/8/5PPP/Q5K1 w - - 0 1',
      playedUci: 'e1e8',
      mateIn: null,
    });
    expect(theme).toBeNull();
  });
});
