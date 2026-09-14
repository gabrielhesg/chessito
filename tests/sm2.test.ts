import { describe, expect, it } from 'vitest';
import { nextReview, type ReviewState } from '@/lib/spaced-repetition/sm2';

const NOW = new Date('2026-01-01T00:00:00.000Z');
const INITIAL: ReviewState = { ease: 2.5, intervalDays: 0, lapses: 0 };

describe('nextReview', () => {
  it('primer acierto: pasa de intervalo 0 a 1 dia, ease se clampea en el tope', () => {
    const result = nextReview(INITIAL, true, NOW);
    expect(result).toEqual({
      ease: 2.5,
      intervalDays: 1,
      lapses: 0,
      dueAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  });

  it('segundo acierto: el intervalo se multiplica por la facilidad', () => {
    const result = nextReview({ ease: 2.5, intervalDays: 1, lapses: 0 }, true, NOW);
    expect(result.intervalDays).toBe(3); // round(1 * 2.5)
    expect(result.dueAt).toEqual(new Date('2026-01-04T00:00:00.000Z'));
  });

  it('acierto con ease mas bajo sigue creciendo el intervalo, redondeado', () => {
    const result = nextReview({ ease: 1.3, intervalDays: 6, lapses: 0 }, true, NOW);
    expect(result.ease).toBeCloseTo(1.4, 5);
    expect(result.intervalDays).toBe(8); // round(6 * 1.4)
  });

  it('falla: intervalo vuelve a 0, suma un lapso, la facilidad baja, vence hoy mismo', () => {
    const result = nextReview({ ease: 2.0, intervalDays: 6, lapses: 1 }, false, NOW);
    expect(result).toEqual({ ease: 1.8, intervalDays: 0, lapses: 2, dueAt: NOW });
  });

  it('la facilidad nunca baja del minimo 1.3', () => {
    const result = nextReview({ ease: 1.35, intervalDays: 0, lapses: 3 }, false, NOW);
    expect(result.ease).toBeCloseTo(1.3, 5);

    const again = nextReview(result, false, NOW);
    expect(again.ease).toBeCloseTo(1.3, 5);
  });

  it('la facilidad nunca sube del maximo 2.5', () => {
    const result = nextReview({ ease: 2.45, intervalDays: 5, lapses: 0 }, true, NOW);
    expect(result.ease).toBeCloseTo(2.5, 5);

    const again = nextReview(result, true, NOW);
    expect(again.ease).toBeCloseTo(2.5, 5);
  });

  it('el intervalo minimo tras un acierto es 1 dia aunque la facilidad sea baja', () => {
    const result = nextReview({ ease: 1.3, intervalDays: 0, lapses: 0 }, true, NOW);
    expect(result.intervalDays).toBe(1);
  });
});
