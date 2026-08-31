/**
 * `win_pct` y `wilson_lower` contra valores de referencia.
 *
 * ENGINEERING.md las marca como obligatorias: "son las funciones de las que cuelgan todas las
 * vistas". Corren contra el Postgres real de `TEST_DB_URL`, que es donde viven.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('funciones SQL de referencia', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL as string });
    await client.connect();
    const { rows } = await client.query<{ existe: boolean }>(
      "select exists(select 1 from pg_proc where proname = 'win_pct') as existe",
    );
    if (!rows[0]?.existe) {
      for (const file of readdirSync(MIGRATIONS).sort()) {
        if (file.endsWith('.sql')) await client.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
      }
    }
  }, 60_000);

  afterAll(async () => {
    await client.end();
  });

  async function num(sql: string, params: unknown[] = []): Promise<number> {
    const res = await client.query<{ v: string }>(sql, params);
    return Number.parseFloat(res.rows[0]?.v ?? 'NaN');
  }

  it('win_pct(0) es exactamente 50', async () => {
    expect(await num('select win_pct(0)::text as v')).toBeCloseTo(50, 5);
  });

  it('win_pct es simetrica alrededor de cero', async () => {
    const arriba = await num('select win_pct(300)::text as v');
    const abajo = await num('select win_pct(-300)::text as v');
    expect(arriba + abajo).toBeCloseTo(100, 3);
  });

  it('win_pct es monotona creciente', async () => {
    const valores = await Promise.all(
      [-1000, -500, -100, 0, 100, 500, 1000].map((cp) => num(`select win_pct(${cp})::text as v`)),
    );
    for (let i = 1; i < valores.length; i += 1) {
      expect(valores[i]!).toBeGreaterThan(valores[i - 1]!);
    }
  });

  it('win_pct se clampea a mas menos 1000 centipeones', async () => {
    expect(await num('select win_pct(1000)::text as v')).toBeCloseTo(
      await num('select win_pct(50000)::text as v'),
      4,
    );
  });

  it('win_pct coincide con la formula de Lichess en valores de referencia', async () => {
    // Valores calculados aparte con 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1),
    // fuera de Postgres, para que el test no verifique la formula contra si misma.
    const casos: [number, number][] = [
      [100, 59.1026],
      [-100, 40.8974],
      [300, 75.1126],
      [-300, 24.8874],
      [600, 90.1077],
    ];
    for (const [cp, esperado] of casos) {
      expect(await num(`select win_pct(${cp})::text as v`)).toBeCloseTo(esperado, 3);
    }
  });

  it('wilson_lower con n = 0 es 0 y no una division por cero', async () => {
    expect(await num('select wilson_lower(0, 0)::text as v')).toBe(0);
  });

  it('wilson_lower castiga la muestra chica: 3 de 5 vale mucho menos que 60%', async () => {
    const chica = await num('select wilson_lower(3, 5)::text as v');
    expect(chica).toBeLessThan(0.4);
    expect(chica).toBeGreaterThan(0.1);
  });

  it('wilson_lower converge al porcentaje real cuando n crece', async () => {
    const n50 = await num('select wilson_lower(30, 50)::text as v');
    const n5000 = await num('select wilson_lower(3000, 5000)::text as v');
    expect(n50).toBeLessThan(0.6);
    expect(n5000).toBeGreaterThan(0.58);
    expect(n5000).toBeLessThan(0.6);
  });

  it('wilson_lower crece con la misma proporcion y mas muestra', async () => {
    const valores = await Promise.all(
      [
        [6, 10],
        [60, 100],
        [600, 1000],
      ].map(([w, n]) => num(`select wilson_lower(${w}, ${n})::text as v`)),
    );
    expect(valores[1]!).toBeGreaterThan(valores[0]!);
    expect(valores[2]!).toBeGreaterThan(valores[1]!);
    expect(valores[2]!).toBeLessThan(0.6);
  });

  it('wilson_lower acepta la suma de score con tablas (0,5) sin romperse', async () => {
    // La aproximacion deliberada del proyecto: se aplica sobre suma de score, no sobre un
    // conteo binomial puro. Tiene que seguir dando un numero entre 0 y 1.
    const valor = await num('select wilson_lower(12.5, 25)::text as v');
    expect(valor).toBeGreaterThan(0);
    expect(valor).toBeLessThan(0.5);
  });
});
