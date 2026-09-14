import { describe, expect, it } from 'vitest';
import { winPct } from '@/lib/analysis/winpct';
import { mateToCp } from '@/lib/analysis/mate';
import { computeMoveLoss, toWhitePerspective } from '@/lib/analysis/signs';
import { classify, isDecided } from '@/lib/analysis/classify';
import { computeDivergencePly } from '@/lib/analysis/divergence';

describe('winPct', () => {
  // Tabla de referencia de docs/ANALYSIS-SPEC.md, verificada contra la funcion SQL en Postgres 16.
  it.each([
    [-1000, 2.5],
    [-300, 24.9],
    [-100, 40.9],
    [0, 50.0],
    [100, 59.1],
    [300, 75.1],
    [900, 96.5],
  ])('winPct(%i) ~= %f', (cp, expected) => {
    expect(winPct(cp)).toBeCloseTo(expected, 1);
  });

  it('clampea a +-1000 antes de convertir', () => {
    expect(winPct(5000)).toBeCloseTo(winPct(1000), 6);
    expect(winPct(-5000)).toBeCloseTo(winPct(-1000), 6);
  });
});

describe('toWhitePerspective (paso 1 de signo)', () => {
  it('no cambia el signo cuando mueven blancas', () => {
    expect(toWhitePerspective(150, 'white')).toBe(150);
  });

  it('invierte el signo cuando mueven negras', () => {
    expect(toWhitePerspective(150, 'black')).toBe(-150);
  });
});

describe('computeMoveLoss (paso 2 de signo) — los dos tests obligatorios del spec', () => {
  it('negras cuelgan la dama en posicion ganada: win_pct_loss sale grande y positivo', () => {
    // Antes: negras ganando comodo (perspectiva blancas muy negativa).
    // Despues de colgar la dama: el eval se da vuelta a favor de blancas.
    const { winPctLoss, cpLoss } = computeMoveLoss({
      evalBeforeWhite: -600,
      evalAfterWhite: 700,
      sideMoved: 'black',
    });
    expect(winPctLoss).toBeGreaterThan(30);
    expect(cpLoss).toBeGreaterThan(0);
  });

  it('el simetrico: blancas cuelgan la dama en posicion ganada', () => {
    const { winPctLoss, cpLoss } = computeMoveLoss({
      evalBeforeWhite: 600,
      evalAfterWhite: -700,
      sideMoved: 'white',
    });
    expect(winPctLoss).toBeGreaterThan(30);
    expect(cpLoss).toBeGreaterThan(0);
  });

  it('una buena jugada (el eval mejora para quien mueve) da perdida 0, no negativa', () => {
    // Blancas mejoran su posicion: eval sube. Perdida no puede ser negativa (clamp a 0).
    const blancas = computeMoveLoss({ evalBeforeWhite: 50, evalAfterWhite: 150, sideMoved: 'white' });
    expect(blancas.winPctLoss).toBe(0);
    expect(blancas.cpLoss).toBe(0);

    // Negras mejoran su posicion: eval (en perspectiva blancas) BAJA. Tambien perdida 0.
    const negras = computeMoveLoss({ evalBeforeWhite: -50, evalAfterWhite: -150, sideMoved: 'black' });
    expect(negras.winPctLoss).toBe(0);
    expect(negras.cpLoss).toBe(0);
  });

  it('una mala jugada de negras SI se detecta (no desaparece por el bug de un solo paso de signo)', () => {
    // Posicion pareja, negras juegan algo que deja el eval (perspectiva blancas) claramente
    // positivo: es una mala jugada de negras y tiene que dar perdida positiva para negras.
    const { winPctLoss } = computeMoveLoss({ evalBeforeWhite: 0, evalAfterWhite: 250, sideMoved: 'black' });
    expect(winPctLoss).toBeGreaterThan(0);
  });
});

describe('mateToCp', () => {
  it('mate a favor del que mueve es +10000', () => {
    expect(mateToCp(3)).toBe(10000);
  });

  it('mate en contra del que mueve es -10000', () => {
    expect(mateToCp(-3)).toBe(-10000);
  });

  it('mate en 3 que se vuelve mate en 5 es perdida cero, no un desplome', () => {
    const antes = mateToCp(3);
    const despues = mateToCp(5);
    const { winPctLoss, cpLoss } = computeMoveLoss({ evalBeforeWhite: antes, evalAfterWhite: despues, sideMoved: 'white' });
    expect(winPctLoss).toBe(0);
    expect(cpLoss).toBe(0);
  });
});

describe('classify', () => {
  it.each([
    [0, 0],
    [9.9, 0],
    [10, 1],
    [19.9, 1],
    [20, 2],
    [29.9, 2],
    [30, 3],
    [80, 3],
  ])('classify(%f) -> %i', (loss, expected) => {
    expect(classify(loss)).toBe(expected);
  });
});

describe('isDecided', () => {
  it('true sobre 95', () => {
    expect(isDecided(96)).toBe(true);
  });
  it('true bajo 5', () => {
    expect(isDecided(4)).toBe(true);
  });
  it('false en el medio', () => {
    expect(isDecided(50)).toBe(false);
    expect(isDecided(95)).toBe(false);
    expect(isDecided(5)).toBe(false);
  });
});

describe('computeDivergencePly', () => {
  it('encuentra el primer ply que cae bajo -100 y no vuelve a superar -50, en mi perspectiva', () => {
    // Yo juego negras: eval_mia = -eval_cp (blancas). La partida se tuerce en el ply 10 y
    // nunca se recupera.
    const entries = [
      { ply: 6, evalWhiteCp: 20 }, // eval_mia = -20, no diverge
      { ply: 8, evalWhiteCp: 150 }, // eval_mia = -150 < -100, pero se recupera despues
      { ply: 9, evalWhiteCp: -30 }, // eval_mia = 30 > -50: descarta el ply 8 como divergencia
      { ply: 10, evalWhiteCp: 200 }, // eval_mia = -200 < -100
      { ply: 12, evalWhiteCp: 300 }, // eval_mia = -300, nunca vuelve a superar -50
    ];
    expect(computeDivergencePly(entries, 'black')).toBe(10);
  });

  it('null si nunca diverge', () => {
    const entries = [
      { ply: 4, evalWhiteCp: 10 },
      { ply: 6, evalWhiteCp: -20 },
      { ply: 8, evalWhiteCp: 30 },
    ];
    expect(computeDivergencePly(entries, 'white')).toBeNull();
  });

  it('funciona igual para blancas, sin girar', () => {
    const entries = [
      { ply: 5, evalWhiteCp: -200 }, // eval_mia (blancas) = -200 < -100
      { ply: 7, evalWhiteCp: -300 }, // nunca se recupera
    ];
    expect(computeDivergencePly(entries, 'white')).toBe(5);
  });
});
