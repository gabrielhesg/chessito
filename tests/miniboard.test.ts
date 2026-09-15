import { describe, expect, it } from 'vitest';
import { lineaEnSan } from '@/components/EnginePanel';

const INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('lineaEnSan', () => {
  it('devuelve el SAN y el FEN DESPUES de cada jugada', () => {
    const pasos = lineaEnSan(INICIAL, ['e2e4', 'e7e5'], 8);
    expect(pasos.map((p) => p.san)).toEqual(['e4', 'e5']);
    expect(pasos[0]?.desde).toBe('e2');
    expect(pasos[0]?.hasta).toBe('e4');
    // El FEN del primer paso ya tiene el peon en e4 y le toca a negras.
    expect(pasos[0]?.fen.split(' ')[1]).toBe('b');
    expect(pasos[1]?.fen.split(' ')[1]).toBe('w');
  });

  it('corta en la primera jugada ilegal en vez de tirar', () => {
    expect(lineaEnSan(INICIAL, ['e2e4', 'a1a8'], 8).map((p) => p.san)).toEqual(['e4']);
  });

  it('respeta el maximo y tolera un FEN invalido', () => {
    expect(lineaEnSan(INICIAL, ['e2e4', 'e7e5', 'g1f3'], 2)).toHaveLength(2);
    expect(lineaEnSan('no-es-un-fen', ['e2e4'], 8)).toEqual([]);
  });
});
