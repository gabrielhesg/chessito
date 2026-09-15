import { describe, expect, it } from 'vitest';
import { describirLinea, explicarBlunder, uciASan } from '@/lib/puzzles/explain';

/**
 * Posiciones reales, no inventadas. La principal es el mate del pastor: despues de
 * 1.e4 e5 2.Ac4 Cc6 3.Dh5, si las negras juegan la natural 3...Cf6?? llega 4.Dxf7#.
 * Es el caso perfecto para probar la explicacion porque la refutacion es corta, forzada,
 * captura material Y termina en mate.
 */
const FEN_PASTOR = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 4 3';

describe('uciASan', () => {
  it('traduce a notacion algebraica, que es como se lee el ajedrez', () => {
    expect(uciASan(FEN_PASTOR, 'g8f6')).toBe('Nf6');
    expect(uciASan(FEN_PASTOR, 'd8e7')).toBe('Qe7');
  });

  it('devuelve null ante una jugada ilegal en vez de lanzar', () => {
    expect(uciASan(FEN_PASTOR, 'a1a8')).toBeNull();
  });

  it('devuelve null ante un FEN invalido', () => {
    expect(uciASan('no es un fen', 'e2e4')).toBeNull();
  });
});

describe('describirLinea', () => {
  it('detecta la captura, el material y el mate de la refutacion', () => {
    // Posicion despues de 3...Cf6??; mueve el rival (blancas) y da mate con 4.Dxf7#.
    const fenDespues = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 5 4';
    const linea = describirLinea(fenDespues, ['h5f7'], false);

    expect(linea).not.toBeNull();
    expect(linea?.pasos).toHaveLength(1);
    expect(linea?.pasos[0]?.san).toBe('Qxf7#');
    expect(linea?.pasos[0]?.mia).toBe(false);
    expect(linea?.pasos[0]?.captura).toEqual({ pieza: 'p', nombre: 'peón', valor: 1 });
    expect(linea?.pasos[0]?.mate).toBe(true);
    expect(linea?.terminaEnMate).toBe(true);
    // Capturo el rival, asi que el material perdido es del lado del ejercicio.
    expect(linea?.materialPerdido).toBe(1);
  });

  it('el material perdido se compensa cuando recapturas', () => {
    // 1.e4 d5 2.exd5 Dxd5: el rival captura un peon y tu recuperas otro. Neto 0.
    const linea = describirLinea(
      'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      ['e4d5', 'd8d5'],
      false,
    );
    expect(linea?.pasos).toHaveLength(2);
    expect(linea?.materialPerdido).toBe(0);
  });

  it('marca el jaque sin marcar mate', () => {
    const linea = describirLinea(FEN_PASTOR, ['d8e7'], true);
    expect(linea?.pasos[0]?.jaque).toBe(false);
    expect(linea?.pasos[0]?.mate).toBe(false);
  });

  it('corta la linea en la primera jugada irreproducible en vez de mentir', () => {
    const linea = describirLinea(FEN_PASTOR, ['d8e7', 'a1a8', 'b1c3'], true);
    expect(linea?.pasos).toHaveLength(1);
    expect(linea?.pasos[0]?.san).toBe('Qe7');
  });

  it('devuelve null con una linea vacia o un FEN invalido', () => {
    expect(describirLinea(FEN_PASTOR, [], true)).toBeNull();
    expect(describirLinea('no es un fen', ['e2e4'], true)).toBeNull();
    expect(describirLinea(FEN_PASTOR, ['a1a8'], true)).toBeNull();
  });
});

describe('explicarBlunder', () => {
  it('explica el mate del pastor: la jugada, el castigo y la alternativa', () => {
    const exp = explicarBlunder({
      fen: FEN_PASTOR,
      playedUci: 'g8f6',
      bestUci: 'd8e7',
      refutationLine: ['h5f7'],
      solutionLine: ['d8e7', 'g1f3'],
      cpLoss: 900,
    });

    expect(exp.jugadaSan).toBe('Nf6');
    expect(exp.mejorSan).toBe('Qe7');
    expect(exp.refutacion?.terminaEnMate).toBe(true);
    expect(exp.refutacion?.pasos[0]?.san).toBe('Qxf7#');
    // La refutacion la juega el rival: el primer paso nunca es "mio".
    expect(exp.refutacion?.pasos[0]?.mia).toBe(false);
    // La solucion la abre Gabriel: el primer paso si es "mio".
    expect(exp.solucion?.pasos[0]?.mia).toBe(true);
    expect(exp.solucion?.pasos[0]?.san).toBe('Qe7');
    expect(exp.cpLoss).toBe(900);
  });

  it('degrada con elegancia cuando todavia no hay lineas guardadas', () => {
    // Es el estado de los ejercicios construidos antes de la migracion 0007, hasta que
    // `puzzles:enrich` los rellene: la explicacion queda corta, no rota.
    const exp = explicarBlunder({
      fen: FEN_PASTOR,
      playedUci: 'g8f6',
      bestUci: 'd8e7',
      refutationLine: null,
      solutionLine: null,
      cpLoss: 900,
    });

    expect(exp.jugadaSan).toBe('Nf6');
    expect(exp.mejorSan).toBe('Qe7');
    expect(exp.refutacion).toBeNull();
    expect(exp.solucion).toBeNull();
  });

  it('no se cae si la jugada jugada es ilegal en esa posicion', () => {
    const exp = explicarBlunder({
      fen: FEN_PASTOR,
      playedUci: 'a1a8',
      bestUci: 'd8e7',
      refutationLine: ['h5f7'],
      solutionLine: null,
      cpLoss: 0,
    });
    expect(exp.jugadaSan).toBeNull();
    expect(exp.refutacion).toBeNull();
  });
});

describe('conceptoDelError', () => {
  it('un mate forzado se nombra como mate, por encima de cualquier patrón', () => {
    const exp = explicarBlunder({
      fen: FEN_PASTOR,
      playedUci: 'g8f6',
      bestUci: 'd8e7',
      refutationLine: ['h5f7'],
      cpLoss: 10000,
    });
    expect(exp.concepto?.tipo).toBe('permite_mate');
    expect(exp.concepto?.texto).toContain('mate');
  });

  it('sin patrón ni material, una caída grande se nombra igual en vez de callar', () => {
    const exp = explicarBlunder({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playedUci: 'a2a4',
      bestUci: 'e2e4',
      refutationLine: ['e7e5'],
      cpLoss: 150,
    });
    expect(exp.concepto?.tipo).toBe('empeora_la_posicion');
  });

  it('una jugada que casi no cuesta nada no inventa un concepto', () => {
    const exp = explicarBlunder({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playedUci: 'e2e4',
      bestUci: 'd2d4',
      refutationLine: ['e7e5'],
      cpLoss: 15,
    });
    expect(exp.concepto).toBeNull();
  });

  it('cada concepto trae su frase en español, no solo una etiqueta', () => {
    const exp = explicarBlunder({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playedUci: 'a2a4',
      bestUci: 'e2e4',
      refutationLine: ['e7e5'],
      cpLoss: 150,
    });
    expect(exp.concepto?.texto.length).toBeGreaterThan(20);
    expect(exp.concepto?.texto).toMatch(/[a-záéíóú]/);
  });
});
