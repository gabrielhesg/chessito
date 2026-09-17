import { describe, expect, it } from 'vitest';
import { despojarDelMotor, esModoCiego } from '@/lib/reviews/ciego';

describe('esModoCiego', () => {
  const base = { timeClass: 'rapid', result: 'loss', yaRevisada: false, revelar: false };

  it('una derrota de rapida sin revisar abre ciega', () => {
    expect(esModoCiego(base)).toBe(true);
  });

  it('una victoria no tiene ritual', () => {
    expect(esModoCiego({ ...base, result: 'win' })).toBe(false);
    expect(esModoCiego({ ...base, result: 'draw' })).toBe(false);
  });

  it('revisar bala y blitz no esta en el plan', () => {
    expect(esModoCiego({ ...base, timeClass: 'bullet' })).toBe(false);
    expect(esModoCiego({ ...base, timeClass: 'blitz' })).toBe(false);
    expect(esModoCiego({ ...base, timeClass: 'daily' })).toBe(false);
  });

  it('una partida ya revisada se abre normal: el ejercicio ya ocurrio', () => {
    expect(esModoCiego({ ...base, yaRevisada: true })).toBe(false);
  });

  it('el escape es visible y funciona sin marcar nada', () => {
    expect(esModoCiego({ ...base, revelar: true })).toBe(false);
  });
});

describe('despojarDelMotor', () => {
  const jugada = {
    ply: 27,
    san: 'Nf6',
    uci: 'g8f6',
    bestUci: 'd7d5',
    isMine: true,
    isBook: false,
    evalCp: -340,
    mateIn: null,
    cpLoss: 280,
    classification: 3,
    moveTimeMs: 1200,
    clockMs: 240_000,
  };

  it('deja en null TODO lo que aporta el motor', () => {
    const despojada = despojarDelMotor(jugada);
    expect(despojada.bestUci).toBeNull();
    expect(despojada.evalCp).toBeNull();
    expect(despojada.mateIn).toBeNull();
    expect(despojada.cpLoss).toBeNull();
    expect(despojada.classification).toBeNull();
  });

  it('conserva lo que sale del PGN y del reloj, que es lo que el ritual necesita', () => {
    const despojada = despojarDelMotor(jugada);
    expect(despojada).toMatchObject({
      ply: 27,
      san: 'Nf6',
      uci: 'g8f6',
      isMine: true,
      isBook: false,
      moveTimeMs: 1200,
      clockMs: 240_000,
    });
  });

  it('no muta la jugada original', () => {
    despojarDelMotor(jugada);
    expect(jugada.evalCp).toBe(-340);
    expect(jugada.classification).toBe(3);
  });

  it('un mate tambien se despoja: mateIn es del motor igual que eval_cp', () => {
    expect(despojarDelMotor({ ...jugada, evalCp: null, mateIn: -2 }).mateIn).toBeNull();
  });
});
