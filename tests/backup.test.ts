import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DIAS_A_CONSERVAR, FILAS_POR_PARTE, fechasARotar, partir } from '@/lib/backup/ndjson';

/**
 * El respaldo falló seis días seguidos (24 al 29 de septiembre) porque subía `moves` entero en un
 * solo archivo y pasó el máximo por objeto de Supabase Storage. Estos tests fijan las dos piezas
 * que lo evitan: partir en trozos, y rotar para no llenar el GB gratuito.
 */
describe('partir', () => {
  it('parte en trozos del tamaño pedido, y el último lleva el resto', () => {
    const lineas = Array.from({ length: 7 }, (_, i) => `{"i":${i}}`);
    expect(partir(lineas, 3).map((p) => p.length)).toEqual([3, 3, 1]);
  });

  it('no pierde ni duplica ninguna fila', () => {
    const lineas = Array.from({ length: 250_001 }, (_, i) => String(i));
    const partes = partir(lineas);
    expect(partes).toHaveLength(3);
    expect(partes.flat()).toEqual(lineas);
  });

  it('sin filas devuelve una parte vacía: el respaldo tiene que existir igual', () => {
    // La ausencia de archivo no distingue "no había nada" de "falló".
    expect(partir([])).toEqual([[]]);
  });

  it('rechaza un tamaño de parte imposible en vez de entrar en un bucle', () => {
    expect(() => partir(['a'], 0)).toThrow();
  });

  it('una parte llena, comprimida, queda muy lejos del tope de 50 MB', () => {
    // Una fila realista de `moves`, repetida `FILAS_POR_PARTE` veces.
    const fila =
      '{"game_id":12345,"ply":42,"eval_cp":-137,"mate_in":null,"best_uci":"e2e4","cp_loss":58,"win_pct_loss":6.2,"classification":1,"is_decided":false}';
    const parte = Array.from({ length: FILAS_POR_PARTE }, () => fila).join('\n');
    const comprimido = gzipSync(Buffer.from(parte, 'utf8'));
    expect(comprimido.byteLength).toBeLessThan(50 * 1024 * 1024);
    // Y se puede volver a leer: un respaldo que no se restaura no es un respaldo.
    expect(gunzipSync(comprimido).toString('utf8')).toBe(parte);
  });
});

describe('fechasARotar', () => {
  const dias = (n: number): string[] =>
    Array.from({ length: n }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);

  it('conserva las más recientes y borra las más viejas', () => {
    expect(fechasARotar(dias(16), 14)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('con menos respaldos que el límite no borra nada', () => {
    expect(fechasARotar(dias(5), DIAS_A_CONSERVAR)).toEqual([]);
  });

  it('ordena por fecha aunque la lista venga desordenada', () => {
    expect(fechasARotar(['2026-09-03', '2026-09-01', '2026-09-02'], 2)).toEqual(['2026-09-01']);
  });

  it('nunca toca algo que no sea una fecha: ante la duda, un respaldo se conserva', () => {
    // `moves-2026-09-01.ndjson` es el formato viejo de un solo bloque: no lo creó esta versión.
    expect(fechasARotar(['moves-2026-09-01.ndjson', 'basura', '2026-09-02'], 1)).toEqual([]);
  });

  it('un límite de cero o negativo no borra todo', () => {
    expect(fechasARotar(dias(5), 0)).toEqual([]);
    expect(fechasARotar(dias(5), -1)).toEqual([]);
  });
});
