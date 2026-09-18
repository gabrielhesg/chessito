import { describe, expect, it } from 'vitest';
import {
  INICIO_DEL_CICLO,
  TEMAS,
  cierreDeSemana,
  loQueFaltaParaConcluir,
  semanaDelCiclo,
} from '@/lib/ciclo/semana';

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

describe('cierreDeSemana', () => {
  const lunes = (iso: string): string => iso;
  // Semana en curso: 2026-09-14 (lunes). `hoy` cae dentro de ella.
  const hoy = new Date('2026-09-17T15:00:00Z');

  const filas = [
    { semana_inicio: lunes('2026-09-14'), n_partidas: 25, theme: 'pieza_colgada', n_blunders: 10 },
    { semana_inicio: lunes('2026-09-07'), n_partidas: 20, theme: 'pieza_colgada', n_blunders: 20 },
    { semana_inicio: lunes('2026-08-31'), n_partidas: 10, theme: 'pieza_colgada', n_blunders: 10 },
  ];

  it('normaliza por partida: una semana con más partidas no empeora por jugar más', () => {
    const r = cierreDeSemana(filas, ['pieza_colgada'], hoy);
    // 10/25 = 0,4 esta semana contra (20+10)/(20+10) = 1,0 en las anteriores.
    expect(r?.estaSemana).toBeCloseTo(0.4, 5);
    expect(r?.anteriores).toBeCloseTo(1.0, 5);
  });

  it('exige muestra en LOS DOS lados antes de concluir', () => {
    expect(cierreDeSemana(filas, ['pieza_colgada'], hoy)?.concluye).toBe(true);
    const flaca = [{ semana_inicio: lunes('2026-09-14'), n_partidas: 4, theme: 'pieza_colgada', n_blunders: 1 }, ...filas.slice(1)];
    expect(cierreDeSemana(flaca, ['pieza_colgada'], hoy)?.concluye).toBe(false);
  });

  it('una semana sin partidas no cuenta como semana de cero errores', () => {
    const conHueco = [
      filas[0]!,
      { semana_inicio: lunes('2026-09-07'), n_partidas: 0, theme: null, n_blunders: 0 },
      filas[2]!,
    ];
    const r = cierreDeSemana(conHueco, ['pieza_colgada'], hoy);
    // Solo entra la del 31-08: 10/10 = 1,0. Si la vacía contara, el promedio bajaría a 0,5.
    expect(r?.anteriores).toBeCloseTo(1.0, 5);
    expect(r?.partidasAnteriores).toBe(10);
  });

  it('un tema sin ejercicios posibles no inventa una comparación', () => {
    expect(cierreDeSemana(filas, [], hoy)).toBeNull();
  });

  it('sin partidas esta semana no hay cierre que mostrar', () => {
    expect(cierreDeSemana(filas.slice(1), ['pieza_colgada'], hoy)).toBeNull();
  });
});

describe('loQueFaltaParaConcluir', () => {
  const base = { estaSemana: 0.4, anteriores: 1.0, partidasEstaSemana: 11, partidasAnteriores: 9, concluye: false };

  it('dice cuántas faltan de cada lado', () => {
    expect(loQueFaltaParaConcluir(base)).toEqual({ faltanEstaSemana: 9, faltanAnteriores: 11 });
  });

  it('no promete nada cuando la comparación ya concluye', () => {
    expect(loQueFaltaParaConcluir({ ...base, concluye: true })).toBeNull();
  });

  it('un lado ya cumplido cuenta como cero, no como negativo', () => {
    const r = loQueFaltaParaConcluir({ ...base, partidasEstaSemana: 25 });
    expect(r?.faltanEstaSemana).toBe(0);
    expect(r?.faltanAnteriores).toBe(11);
  });

  it('sin cierre no hay nada que prometer', () => {
    expect(loQueFaltaParaConcluir(null)).toBeNull();
  });
});
