import { describe, expect, it } from 'vitest';
import { INICIO_DEL_CICLO, TEMAS, semanaDelCiclo } from '@/lib/ciclo/semana';

const en = (iso: string): Date => new Date(`${iso}T15:00:00Z`);

describe('semanaDelCiclo', () => {
  it('el primer dia es la semana 1', () => {
    const s = semanaDelCiclo(en(INICIO_DEL_CICLO));
    expect(s?.numero).toBe(1);
    expect(s?.tema.titulo).toBe('Seguridad y amenazas');
    expect(s?.diaDeLaSemana).toBe(0);
    expect(s?.vuelta).toBe(0);
  });

  it('el septimo dia sigue siendo la semana 1, el octavo es la 2', () => {
    expect(semanaDelCiclo(en('2026-09-21'))?.numero).toBe(1);
    expect(semanaDelCiclo(en('2026-09-22'))?.numero).toBe(2);
  });

  it('el ciclo da la vuelta a las 8 semanas y lo dice', () => {
    // 8 semanas son 56 dias: el dia 56 es la semana 1 de la vuelta 1.
    const s = semanaDelCiclo(en('2026-11-10'));
    expect(s?.numero).toBe(1);
    expect(s?.vuelta).toBe(1);
  });

  it('antes del inicio no hay semana: no es la semana 8 de la vuelta -1', () => {
    expect(semanaDelCiclo(en('2026-09-14'))).toBeNull();
  });

  it('una fecha de inicio invalida devuelve null en vez de un NaN que se propaga', () => {
    expect(semanaDelCiclo(en('2026-10-01'), 'no-es-una-fecha')).toBeNull();
  });

  it('los ocho temas existen y ninguno repite id', () => {
    expect(TEMAS).toHaveLength(8);
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(8);
  });

  it('los themes declarados existen de verdad en los ejercicios', () => {
    // Si alguien inventa un theme, la semana ordena una cola vacia y no se nota. Los validos son
    // los que `lib/chess/theme.ts` sabe detectar.
    const validos = new Set(['pieza_colgada', 'mate_pasillo', 'permite_horquilla']);
    for (const tema of TEMAS) {
      for (const t of tema.themes) expect(validos.has(t)).toBe(true);
    }
  });
});
