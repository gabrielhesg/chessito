import { describe, expect, it } from 'vitest';
import { accuracyDeJugada, accuracyDePartida } from '@/lib/analysis/accuracy';

describe('accuracyDeJugada', () => {
  it('una jugada que no pierde nada vale 100', () => {
    expect(accuracyDeJugada(0)).toBe(100);
  });

  it('decrece de forma monotona a medida que crece la caida de win%', () => {
    const valores = [0, 2, 5, 10, 20, 40].map(accuracyDeJugada);
    for (let i = 1; i < valores.length; i += 1) {
      expect(valores[i]!).toBeLessThan(valores[i - 1]!);
    }
  });

  it('una caida chica sigue siendo una precision alta', () => {
    // 2 puntos de win% es una imprecision menor: tiene que quedar arriba de 90.
    expect(accuracyDeJugada(2)).toBeGreaterThan(90);
  });

  it('un blunder que tira la partida queda cerca de 0', () => {
    expect(accuracyDeJugada(60)).toBeLessThan(10);
    expect(accuracyDeJugada(100)).toBeGreaterThanOrEqual(0);
  });

  it('nunca sale del rango 0-100, ni con entradas absurdas', () => {
    for (const caida of [-50, 0, 1000]) {
      const v = accuracyDeJugada(caida);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('accuracyDePartida', () => {
  const jugada = (winPctLoss: number | null, extra: Partial<{ isBook: boolean; isDecided: boolean }> = {}) => ({
    winPctLoss,
    isBook: extra.isBook ?? false,
    isDecided: extra.isDecided ?? false,
  });

  it('una partida sin errores da 100', () => {
    expect(accuracyDePartida([jugada(0), jugada(0), jugada(0)])).toBe(100);
  });

  it('un blunder arrastra el promedio hacia abajo', () => {
    const limpia = accuracyDePartida([jugada(0), jugada(0), jugada(0), jugada(0)]);
    const conBlunder = accuracyDePartida([jugada(0), jugada(0), jugada(0), jugada(50)]);
    expect(conBlunder!).toBeLessThan(limpia!);
  });

  it('excluye las jugadas de libro: jugar de memoria no demuestra precision', () => {
    // Si el libro contara, esta partida daria un promedio inflado por sus dos jugadas perfectas.
    const soloLibroPerfecto = accuracyDePartida([
      jugada(0, { isBook: true }),
      jugada(0, { isBook: true }),
      jugada(40),
    ]);
    expect(soloLibroPerfecto).toBe(accuracyDePartida([jugada(40)]));
  });

  it('excluye las jugadas de una partida ya decidida', () => {
    expect(accuracyDePartida([jugada(30, { isDecided: true }), jugada(0)])).toBe(100);
  });

  it('ignora las jugadas sin analizar en vez de contarlas como perfectas', () => {
    expect(accuracyDePartida([jugada(null), jugada(0)])).toBe(100);
  });

  it('devuelve null cuando no queda nada que contar, no un 100 enganoso', () => {
    expect(accuracyDePartida([])).toBeNull();
    expect(accuracyDePartida([jugada(null)])).toBeNull();
    expect(accuracyDePartida([jugada(0, { isBook: true })])).toBeNull();
  });
});
