import { describe, expect, it } from 'vitest';
import { diagnosticar, frasesDelDiagnostico } from '@/lib/puzzles/diagnostico';
import { describirLinea } from '@/lib/puzzles/explain';

/**
 * Posiciones reales, no inventadas. Un diagnostico que dice algo falso sobre una posicion
 * concreta es peor que la frase generica que reemplaza.
 */

// Mate del pastor: despues de 1.e4 e5 2.Ac4 Cc6 3.Dh5, las negras juegan 3...Cf6?? y llega 4.Dxf7#.
const PASTOR = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 4 3';

function conRefutacion(fen: string, playedUci: string, lineaRival: string[]) {
  const tras = describirLinea(fen, [playedUci], true);
  const fenDespues = tras?.pasos[0]?.fen ?? fen;
  return describirLinea(fenDespues, lineaRival, false);
}

describe('diagnosticar', () => {
  it('un mate forzado se nombra como mate y nombra la jugada que no viste', () => {
    const d = diagnosticar({
      fen: PASTOR,
      playedUci: 'g8f6',
      bestUci: 'g7g6',
      refutacion: conRefutacion(PASTOR, 'g8f6', ['h5f7']),
      cpLoss: 2000,
    });
    expect(d?.concepto).toBe('permite_mate');
    expect(d?.jugadaQueNoViste).toBe('Qxf7#');
    expect(d?.terminaEnMate).toBe(true);
    expect(frasesDelDiagnostico(d!)[0]).toContain('Qxf7#');
  });

  it('la buena se describe por lo que hace, no solo por su nombre', () => {
    // 3...g6 no defiende f7: lo que hace es atacar la dama de h5, que es la que venia al golpe.
    const d = diagnosticar({
      fen: PASTOR,
      playedUci: 'g8f6',
      bestUci: 'g7g6',
      refutacion: conRefutacion(PASTOR, 'g8f6', ['h5f7']),
      cpLoss: 2000,
    });
    expect(d?.laBuena?.san).toBe('g6');
    expect(d?.laBuena?.que).toBe('ataca_al_atacante');
    expect(frasesDelDiagnostico(d!).at(-1)).toContain('g6');
  });

  it('mover una pieza a una casilla atacada se nombra como colgarla', () => {
    // Negras mueven el caballo de c6 a d4, donde el caballo blanco de f3 lo come.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 2';
    const d = diagnosticar({
      fen,
      playedUci: 'c6d4',
      bestUci: 'g8f6',
      refutacion: conRefutacion(fen, 'c6d4', ['f3d4']),
      cpLoss: 300,
    });
    expect(d?.concepto).toBe('cuelga_la_pieza_movida');
    expect(d?.colgasteLaQueMoviste).toBe(true);
    expect(d?.perdida?.nombre).toBe('caballo');
    expect(frasesDelDiagnostico(d!).join(' ')).toContain('quién la ataca y quién la defiende');
  });

  it('mover al defensor de otra pieza se nombra como abandonar la defensa', () => {
    // La torre de d1 es lo unico que defiende el caballo de d4, y el peon negro de e5 lo ataca.
    // Al mover la torre a a1, el caballo queda solo y se lo comen.
    const fen = '4k3/8/8/4p3/3N4/8/8/3RK3 w - - 0 1';
    const d = diagnosticar({
      fen,
      playedUci: 'd1a1',
      bestUci: 'd4f3',
      refutacion: conRefutacion(fen, 'd1a1', ['e5d4']),
      cpLoss: 300,
    });
    expect(d?.concepto).toBe('abandonas_la_defensa');
    expect(d?.abandonasteLaDefensa).toEqual({ nombre: 'torre', desde: 'd1' });
    expect(d?.laBuena?.que).toBe('mueve_la_amenazada');
    expect(frasesDelDiagnostico(d!).join(' ')).toContain('qué está defendiendo la pieza que vas a tocar');
  });

  it('sin refutacion y con poca caida no inventa un diagnostico', () => {
    expect(
      diagnosticar({ fen: PASTOR, playedUci: 'g8f6', bestUci: 'g7g6', refutacion: null, cpLoss: 40 }),
    ).toBeNull();
  });

  it('sin refutacion pero con caida grande cae en el generico, no en silencio', () => {
    const d = diagnosticar({
      fen: PASTOR,
      playedUci: 'g8f6',
      bestUci: 'g7g6',
      refutacion: null,
      cpLoss: 400,
    });
    expect(d?.concepto).toBe('empeora_la_posicion');
    expect(d?.jugadaQueNoViste).toBeNull();
  });

  it('un FEN o una jugada imposibles devuelven null en vez de tirar', () => {
    expect(diagnosticar({ fen: 'basura', playedUci: 'e2e4', bestUci: 'd2d4', refutacion: null, cpLoss: 0 })).toBeNull();
    expect(diagnosticar({ fen: PASTOR, playedUci: 'zz', bestUci: 'g7g6', refutacion: null, cpLoss: 0 })).toBeNull();
  });
});
