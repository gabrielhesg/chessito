/**
 * F2-04 · Las vistas de /reloj separan clases de tiempo (migracion 0012).
 *
 * Lo que se prueba NO es que las vistas nuevas compilen: es que la vieja **mezcla** y la nueva
 * **no**, con la forma exacta del problema que la revision integral encontro en produccion —
 * 1.850 partidas de bala y 5.660 de blitz contra 2.588 de rapida, todas promediadas juntas, de
 * manera que /reloj describia la bala mientras decia describir al jugador.
 *
 * Un invariante que nunca se probo contra el bug que lo motivo no es un invariante.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('reloj por clase · migracion 0012', () => {
  let client: Client;

  async function partida(id: number, campos: Record<string, unknown> = {}): Promise<void> {
    const base: Record<string, unknown> = {
      id,
      chesscom_uuid: `uuid-${id}`,
      url: `https://example.test/${id}`,
      end_time: new Date(Date.UTC(2026, 0, 1, 12, 0, id % 60)).toISOString(),
      time_class: 'rapid',
      time_control: '600',
      base_seconds: 600,
      increment_secs: 0,
      rules: 'chess',
      my_color: 'white',
      my_rating: 1250,
      opp_rating: 1250,
      opp_username: 'rival',
      result: 'loss',
      score: 0,
      termination: 'resigned',
      ply_count: 2,
      pgn: '1. e4 e5',
      analysis_state: 'pending',
      ...campos,
    };
    const cols = Object.keys(base);
    await client.query(
      `insert into games (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => base[c]),
    );
  }

  async function jugada(gameId: number, ply: number, moveTimeMs: number): Promise<void> {
    await client.query(
      `insert into moves (game_id, ply, is_mine, san, uci, phase, is_book, is_decided, move_time_ms)
       values ($1, $2, true, 'e4', 'e2e4', 1, false, false, $3)`,
      [gameId, ply, moveTimeMs],
    );
  }

  beforeAll(async () => {
    client = new Client({ connectionString: DB_URL as string });
    await client.connect();
    await client.query('drop schema if exists public cascade');
    await client.query('create schema public');
    for (const file of readdirSync(MIGRATIONS).sort()) {
      if (file.endsWith('.sql')) await client.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  beforeEach(async () => {
    await client.query('truncate games, moves, puzzles, puzzle_attempts restart identity cascade');
  });

  /**
   * Una de bala pensando 1 segundo y una de rapida pensando 31. El promedio mezclado da 16, que
   * no describe ninguna de las dos: es el numero que /reloj mostraba.
   */
  async function unaDeBalaYUnaDeRapida(): Promise<void> {
    await partida(1, { time_class: 'bullet', time_control: '60', base_seconds: 60 });
    await jugada(1, 1, 1_000);
    await partida(2, { time_class: 'rapid' });
    await jugada(2, 1, 31_000);
  }

  it('la vista vieja de 0006 mezcla las clases en un promedio que no describe a ninguna', async () => {
    await unaDeBalaYUnaDeRapida();

    const res = await client.query<{ n: string; avg_move_time_ms: number }>(
      'select n::text, avg_move_time_ms from v_move_time_by_ply where ply = 1',
    );
    // Una sola fila para las dos clases, con el promedio de las dos.
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]?.avg_move_time_ms).toBe(16_000);
  });

  it('v_tiempo_por_jugada devuelve una fila por clase, cada una con su propio promedio', async () => {
    await unaDeBalaYUnaDeRapida();

    const res = await client.query<{ time_class: string; n: string; avg_move_time_ms: number }>(
      'select time_class, n::text, avg_move_time_ms from v_tiempo_por_jugada where ply = 1 order by time_class',
    );
    expect(res.rows).toHaveLength(2);
    expect(res.rows).toEqual([
      { time_class: 'bullet', n: '1', avg_move_time_ms: 1_000 },
      { time_class: 'rapid', n: '1', avg_move_time_ms: 31_000 },
    ]);
  });

  it('v_tiempo_por_fase separa el % bajo 3s por clase, que es el numero de la portada de /reloj', async () => {
    await unaDeBalaYUnaDeRapida();

    const res = await client.query<{ time_class: string; pct_under_3s_bruto: number }>(
      'select time_class, pct_under_3s_bruto from v_tiempo_por_fase order by time_class',
    );
    // En bala TODAS las jugadas son rapidas y en esta rapida NINGUNA lo es. Mezclarlas daba 50%,
    // que es exactamente la cifra que hacia ver un problema de apuro donde no lo habia.
    expect(res.rows).toEqual([
      { time_class: 'bullet', pct_under_3s_bruto: 1 },
      { time_class: 'rapid', pct_under_3s_bruto: 0 },
    ]);
  });

  it('v_distribucion_de_tiempo manda cada clase a su propio tramo', async () => {
    await unaDeBalaYUnaDeRapida();

    const res = await client.query<{ time_class: string; time_bucket: string; n: string }>(
      'select time_class, time_bucket, n::text from v_distribucion_de_tiempo order by time_class',
    );
    expect(res.rows).toEqual([
      { time_class: 'bullet', time_bucket: '<3s', n: '1' },
      { time_class: 'rapid', time_bucket: '>30s', n: '1' },
    ]);
  });

  it('v_momento_del_timeout no suma las derrotas por tiempo de bala a las de rapida', async () => {
    await partida(1, { time_class: 'bullet', time_control: '60', base_seconds: 60, termination: 'timeout' });
    await jugada(1, 1, 1_000);
    await partida(2, { time_class: 'rapid', termination: 'timeout' });
    await jugada(2, 1, 31_000);

    const res = await client.query<{ time_class: string; n_games: string }>(
      'select time_class, n_games::text from v_momento_del_timeout order by time_class',
    );
    expect(res.rows).toEqual([
      { time_class: 'bullet', n_games: '1' },
      { time_class: 'rapid', n_games: '1' },
    ]);
  });

  it('las cuatro vistas nuevas corren con security_invoker, como exige la regla de 0005', async () => {
    const res = await client.query<{ relname: string }>(
      `select c.relname from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('v_tiempo_por_jugada','v_tiempo_por_fase','v_distribucion_de_tiempo','v_momento_del_timeout')
          and c.reloptions @> array['security_invoker=on']
        order by c.relname`,
    );
    expect(res.rows.map((r) => r.relname)).toEqual([
      'v_distribucion_de_tiempo',
      'v_momento_del_timeout',
      'v_tiempo_por_fase',
      'v_tiempo_por_jugada',
    ]);
  });
});
