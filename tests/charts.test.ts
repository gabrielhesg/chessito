import { describe, expect, it } from 'vitest';
import { acotar, escalaLineal, ticksLegibles } from '@/lib/charts/scale';
import { caminoArea, caminoAreaCurva, caminoCurva, caminoLinea } from '@/lib/charts/path';

describe('escalaLineal', () => {
  it('mapea los extremos del dominio a los extremos del rango', () => {
    const e = escalaLineal([0, 100], [0, 200]);
    expect(e(0)).toBe(0);
    expect(e(50)).toBe(100);
    expect(e(100)).toBe(200);
  });

  it('soporta un rango invertido, que es el caso normal en SVG (y crece hacia abajo)', () => {
    const e = escalaLineal([0, 10], [100, 0]);
    expect(e(0)).toBe(100);
    expect(e(10)).toBe(0);
    expect(e(5)).toBe(50);
  });

  it('extrapola fuera del dominio sin romperse', () => {
    const e = escalaLineal([0, 10], [0, 100]);
    expect(e(15)).toBe(150);
    expect(e(-5)).toBe(-50);
  });

  it('un dominio degenerado (un solo valor) devuelve el centro del rango, no NaN', () => {
    const e = escalaLineal([7, 7], [0, 50]);
    expect(e(7)).toBe(25);
    expect(e(999)).toBe(25);
  });
});

describe('ticksLegibles', () => {
  it('devuelve numeros redondos dentro del dominio', () => {
    expect(ticksLegibles(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('no inventa marcas fuera del dominio', () => {
    const ticks = ticksLegibles(3, 17, 4);
    expect(ticks.every((t) => t >= 3 && t <= 17)).toBe(true);
  });

  it('funciona con dominios chicos y decimales', () => {
    expect(ticksLegibles(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('funciona con dominios negativos y cruzando el cero', () => {
    expect(ticksLegibles(-100, 100, 4)).toEqual([-100, -50, 0, 50, 100]);
  });

  it('acepta el dominio al reves', () => {
    expect(ticksLegibles(100, 0, 5)).toEqual([0, 20, 40, 60, 80, 100]);
  });

  it('un dominio de un solo punto devuelve ese punto', () => {
    expect(ticksLegibles(5, 5)).toEqual([5]);
  });

  it('devuelve vacio ante entradas no finitas', () => {
    expect(ticksLegibles(Number.NaN, 10)).toEqual([]);
    expect(ticksLegibles(0, Number.POSITIVE_INFINITY)).toEqual([]);
    expect(ticksLegibles(0, 10, 0)).toEqual([]);
  });
});

describe('acotar', () => {
  it('acota por ambos lados y deja pasar lo que esta dentro', () => {
    expect(acotar(5, 0, 10)).toBe(5);
    expect(acotar(-3, 0, 10)).toBe(0);
    expect(acotar(42, 0, 10)).toBe(10);
  });
});

describe('caminoLinea', () => {
  it('arma un path con M inicial y L para el resto', () => {
    expect(caminoLinea([{ x: 0, y: 10 }, { x: 5, y: 20 }])).toBe('M0 10 L5 20');
  });

  it('redondea a dos decimales para no ensuciar el SVG', () => {
    expect(caminoLinea([{ x: 1.23456, y: 9.87654 }])).toBe('M1.23 9.88');
  });

  it('devuelve vacio sin puntos', () => {
    expect(caminoLinea([])).toBe('');
  });
});

describe('caminoArea', () => {
  it('cierra el area contra la linea base, no contra el borde', () => {
    const d = caminoArea([{ x: 0, y: 10 }, { x: 10, y: 30 }], 20);
    expect(d).toBe('M0 20 L0 10 L10 30 L10 20 Z');
  });

  it('devuelve vacio sin puntos', () => {
    expect(caminoArea([], 0)).toBe('');
  });
});

describe('caminoCurva', () => {
  const puntos = [
    { x: 0, y: 50 },
    { x: 10, y: 10 },
    { x: 20, y: 90 },
    { x: 30, y: 50 },
  ];

  it('arranca en el primer punto y termina en el ultimo', () => {
    const d = caminoCurva(puntos);
    expect(d.startsWith('M0 50')).toBe(true);
    expect(d.endsWith('30 50')).toBe(true);
  });

  it('pasa POR cada punto: cada segmento cubico termina en el punto siguiente', () => {
    const d = caminoCurva(puntos);
    // El destino de una curva cubica es el ultimo par de cada comando C.
    const destinos = [...d.matchAll(/C[^C]*?,\s*[-\d.]+ [-\d.]+,\s*([-\d.]+) ([-\d.]+)/g)].map(
      (m) => ({ x: Number(m[1]), y: Number(m[2]) }),
    );
    expect(destinos).toEqual(puntos.slice(1));
  });

  it('con menos de tres puntos no hay nada que curvar y cae a la recta', () => {
    const dos = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(caminoCurva(dos)).toBe(caminoLinea(dos));
    expect(caminoCurva([])).toBe('');
  });

  it('tension 0 deja los controles sobre los propios puntos, es decir, rectas', () => {
    const d = caminoCurva(puntos, { tension: 0 });
    expect(d).toContain('C0 50, 10 10, 10 10');
  });

  it('acota los puntos de control al limite, que es lo que evita que un pico se salga de la caja', () => {
    // Un pico agudo: sin limite, los controles se van bastante mas arriba de y=0.
    const pico = [
      { x: 0, y: 100 },
      { x: 10, y: 0 },
      { x: 20, y: 100 },
      { x: 30, y: 100 },
    ];
    const d = caminoCurva(pico, { limiteY: [0, 100] });
    const todasLasY = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...todasLasY)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...todasLasY)).toBeLessThanOrEqual(100);
  });
});

describe('caminoAreaCurva', () => {
  const puntos = [
    { x: 0, y: 40 },
    { x: 10, y: 20 },
    { x: 20, y: 60 },
  ];

  it('abre en la base, recorre la curva y cierra en la base', () => {
    const d = caminoAreaCurva(puntos, 50);
    expect(d.startsWith('M0 50 L0 40')).toBe(true);
    expect(d.endsWith('L20 50 Z')).toBe(true);
    expect(d).toContain('C');
  });

  it('sin puntos no dibuja nada', () => {
    expect(caminoAreaCurva([], 50)).toBe('');
  });
});
