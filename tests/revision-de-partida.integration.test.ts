/**
 * F2-01 · La cola de derrotas sin revisar (migracion 0013).
 *
 * El ritual del plan de entrenamiento es "toda derrota se analiza". Hasta ahora la app no tenia
 * donde anotar que eso paso, asi que la tarea 2 de la portada solo se podia marcar hecha cuando
 * NO habia ninguna derrota — es decir, premiando no jugar. Lo que se prueba aca es que la cola
 * se vacia por revisar, no por dejar de perder.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('revision de partida · migracion 0013', () => {
  let client: Client;

  async function partida(id: number, campos: Record<string, unknown> = {}): Promise<void> {
    const base: Record<string, unknown> = {
      id,
      chesscom_uuid: `uuid-${id}`,
      url: `https://example.test/${id}`,
      // Relativas a ahora, porque la vista tiene ventana de 30 dias: `id` dias atras, asi que
      // id mayor = mas antigua.
      end_time: new Date(Date.now() - id * 24 * 60 * 60 * 1000).toISOString(),
      time_class: 'rapid',
      time_control: '600',
      base_seconds: 600,
      increment_secs: 0,
      rules: 'chess',
      my_color: 'white',
      my_rating: 1250,
      opp_rating: 1250,
      opp_username: `rival${id}`,
      result: 'loss',
      score: 0,
      termination: 'resigned',
      ply_count: 2,
      pgn: '1. e4 e5',
      analysis_state: 'done',
      ...campos,
    };
    const cols = Object.keys(base);
    await client.query(
      `insert into games (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => base[c]),
    );
  }

  async function cola(): Promise<{ id: number; n_total: string }[]> {
    const res = await client.query<{ id: number; n_total: string }>(
      // `id` es bigserial y node-pg devuelve los bigint como texto. Via PostgREST (que es como
      // los lee la app) llegan como number, asi que el casteo es del test, no del esquema.
      'select id::int as id, n_total::text from v_derrotas_sin_revisar',
    );
    return res.rows;
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
    await client.query('truncate games, moves, puzzles, puzzle_attempts, game_reviews restart identity cascade');
  });

  it('la cola se vacia al revisar, no al dejar de perder', async () => {
    await partida(1);
    expect((await cola()).map((r) => r.id)).toEqual([1]);

    await client.query(
      "insert into game_reviews (game_id, ply_marcado, motivo, ply_del_motor) values (1, 14, 'colgue_material', 8)",
    );
    expect(await cola()).toHaveLength(0);
  });

  it('solo derrotas de rapida: ni la bala ni las victorias entran', async () => {
    await partida(1, { time_class: 'bullet', time_control: '60', base_seconds: 60 });
    await partida(2, { result: 'win', score: 1, termination: 'checkmate' });
    await partida(3);

    expect((await cola()).map((r) => r.id)).toEqual([3]);
  });

  it('la mas reciente va primera y n_total cuenta la cola entera', async () => {
    await partida(1);
    await partida(2);
    await partida(3);

    const filas = await cola();
    // Orden: la derrota de ayer se recuerda, la de hace ocho meses no.
    expect(filas.map((r) => r.id)).toEqual([1, 2, 3]);
    // n_total es una ventana sobre la misma consulta: la portada puede decir "y 2 mas" pidiendo
    // solo la primera fila, sin una segunda lectura.
    const res = await client.query<{ id: number; n_total: string }>(
      'select id::int as id, n_total::text from v_derrotas_sin_revisar limit 1',
    );
    expect(res.rows[0]).toEqual({ id: 1, n_total: '3' });
  });

  it('una derrota vieja no entra a la cola, aunque nunca se haya revisado', async () => {
    await partida(1);
    // Hace ocho meses. No se revisa porque no se recuerda la partida, y sumarla solo convierte
    // la portada en una deuda de 1.191 partidas.
    await partida(2, { end_time: new Date(Date.now() - 240 * 24 * 60 * 60 * 1000).toISOString() });

    expect((await cola()).map((r) => r.id)).toEqual([1]);
  });

  it('saltarse el ritual tambien cuenta como revisada', async () => {
    await partida(1);
    // El boton de escape: sin ply ni motivo. La restriccion lo permite porque la alternativa es
    // una cola que crece para siempre y deja de mirarse.
    await client.query('insert into game_reviews (game_id) values (1)');
    expect(await cola()).toHaveLength(0);
  });

  it('marcar un ply sin decir por que es media revision, y la base lo rechaza', async () => {
    await partida(1);
    await expect(
      client.query('insert into game_reviews (game_id, ply_marcado) values (1, 14)'),
    ).rejects.toThrow(/game_reviews_completa/);
  });

  it('v_motivos_de_derrota mide cuanto se aleja el ply marcado del que senala el motor', async () => {
    await partida(1);
    await partida(2);
    await client.query(
      `insert into game_reviews (game_id, ply_marcado, motivo, ply_del_motor) values
         (1, 14, 'colgue_material', 8),
         (2, 20, 'colgue_material', 20)`,
    );

    const res = await client.query<{ motivo: string; n: number; coincide_con_el_motor: number; plies_de_diferencia: number }>(
      'select motivo, n, coincide_con_el_motor, plies_de_diferencia from v_motivos_de_derrota',
    );
    expect(res.rows).toEqual([
      { motivo: 'colgue_material', n: 2, coincide_con_el_motor: 1, plies_de_diferencia: 3 },
    ]);
  });
});
