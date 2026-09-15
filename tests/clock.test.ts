import { describe, expect, it } from 'vitest';
import { formatClock, relojesEnPly } from '@/lib/chess/clock';

describe('relojesEnPly', () => {
  // Una partida de 10+0: blancas y negras alternan y cada uno deja su reloj en su propio ply.
  const clocks = [598_000, 597_000, 590_000, 585_000, 570_000];
  const BASE = 600;

  it('en la posicion inicial los dos relojes son el tiempo base, no nulos', () => {
    expect(relojesEnPly(clocks, 0, BASE)).toEqual({ blancas: 600_000, negras: 600_000 });
  });

  it('despues del ply 1 solo cambio el reloj de blancas', () => {
    expect(relojesEnPly(clocks, 1, BASE)).toEqual({ blancas: 598_000, negras: 600_000 });
  });

  it('toma el ultimo ply de cada bando, no el ultimo ply a secas', () => {
    // Ply 3 es de blancas: negras se queda con el ply 2.
    expect(relojesEnPly(clocks, 3, BASE)).toEqual({ blancas: 590_000, negras: 597_000 });
    // Ply 4 es de negras: blancas se queda con el ply 3.
    expect(relojesEnPly(clocks, 4, BASE)).toEqual({ blancas: 590_000, negras: 585_000 });
  });

  it('un %clk faltante se salta y sigue buscando hacia atras', () => {
    const conHueco = [598_000, 597_000, null, 585_000];
    expect(relojesEnPly(conHueco, 4, BASE).blancas).toBe(598_000);
  });

  it('sin ningun %clk de un bando cae al tiempo base', () => {
    expect(relojesEnPly([null, null], 2, BASE)).toEqual({ blancas: 600_000, negras: 600_000 });
  });

  it('un ply mas alla del final no se sale del arreglo', () => {
    expect(relojesEnPly(clocks, 99, BASE)).toEqual({ blancas: 570_000, negras: 585_000 });
  });

  it('sin tiempo base (correspondencia) el reloj desconocido queda en null', () => {
    expect(relojesEnPly([], 0, 0)).toEqual({ blancas: null, negras: null });
  });
});

describe('formatClock', () => {
  it('muestra minutos y segundos', () => {
    expect(formatClock(614_000)).toBe('10:14');
    expect(formatClock(60_000)).toBe('1:00');
  });

  it('bajo un minuto muestra decimas, que es cuando importan', () => {
    expect(formatClock(9_400)).toBe('0:09.4');
    expect(formatClock(500)).toBe('0:00.5');
  });

  it('sin dato muestra una raya, no un cero que se leeria como bandera caida', () => {
    expect(formatClock(null)).toBe('—');
  });

  it('un negativo se muestra como cero', () => {
    expect(formatClock(-5)).toBe('0:00.0');
  });
});
