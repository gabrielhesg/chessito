/**
 * F2-03 · La sesion dirigida (migracion 0014).
 *
 * La cola se elegia por `due_at` a secas. Como los ejercicios se construyen desde TODAS las
 * clases (decision deliberada de la Fase 12: una posicion perdida en blitz entrena igual), lo que
 * se servia no tenia ninguna relacion con la partida que el alumno acababa de perder. Lo que se
 * prueba aca es que la prioridad gana sobre la fecha — sin eso, "entrena los errores de tu
 * derrota de ayer" es exactamente lo que la app no puede hacer.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('sesion dirigida · migracion 0014', () => {
  let client: Client;

  async function partida(id: number, campos: Record<string, unknown> = {}): Promise<void> {
    const base: Record<string, unknown> = {
      id,
      chesscom_uuid: `uuid-${id}`,
      url: `https://example.test/${id}`,
      end_time: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
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

  async function ejercicio(id: number, gameId: number, campos: Record<string, unknown> = {}): Promise<void> {
    const base: Record<string, unknown> = {
      id,
      game_id: gameId,
      ply: id,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      played_uci: 'e2e4',
      best_uci: 'd2d4',
      cp_loss: 300,
      win_pct_loss: 25,
      is_unique: true,
      theme: 'pieza_colgada',
      due_at: new Date(Date.now() - 60_000).toISOString(),
      ...campos,
    };
    const cols = Object.keys(base);
    await client.query(
      `insert into puzzles (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => base[c]),
    );
  }

  /** La consulta que hace `nextDuePuzzle`: vencidos, por prioridad y despues por fecha. */
  async function colaServida(): Promise<number[]> {
    const res = await client.query<{ id: number }>(
      `select id::int as id from v_cola_de_ejercicios
        where due_at <= now()
        order by prioridad, due_at`,
    );
    return res.rows.map((r) => r.id);
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

  it('el ejercicio de una derrota de rapida reciente se sirve primero, aunque venza despues', async () => {
    // La de blitz vencio hace una semana; la de rapida, hace un minuto. Por `due_at` a secas
    // ganaria la de blitz, que es justo lo que pasaba antes.
    await partida(1, { time_class: 'blitz', time_control: '180', base_seconds: 180 });
    await ejercicio(1, 1, { due_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() });
    await partida(2);
    await ejercicio(2, 2);

    expect(await colaServida()).toEqual([2, 1]);
  });

  it('una derrota de rapida de hace mas de 7 dias ya no es prioridad: no se recuerda', async () => {
    await partida(1, { end_time: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString() });
    const res = await client.query<{ prioridad: number }>(
      'select prioridad from v_cola_de_ejercicios where game_id = 1',
    );
    await ejercicio(1, 1);
    const despues = await client.query<{ prioridad: number }>(
      'select prioridad from v_cola_de_ejercicios where game_id = 1',
    );
    expect(res.rows).toHaveLength(0);
    expect(despues.rows[0]?.prioridad).toBe(1);
  });

  it('una VICTORIA de rapida reciente tampoco es prioridad: no hay error fresco que entrenar', async () => {
    await partida(1, { result: 'win', score: 1, termination: 'checkmate' });
    await ejercicio(1, 1);
    const res = await client.query<{ prioridad: number }>(
      'select prioridad from v_cola_de_ejercicios where game_id = 1',
    );
    expect(res.rows[0]?.prioridad).toBe(1);
  });

  it('v_ejercicios_por_partida cuenta todos, y aparte los vencidos', async () => {
    await partida(1);
    await ejercicio(1, 1);
    await ejercicio(2, 1, { due_at: new Date(Date.now() + 86_400_000).toISOString() });

    const res = await client.query<{ n: number; n_vencidos: number }>(
      'select n, n_vencidos from v_ejercicios_por_partida where game_id = 1',
    );
    // El boton de /partida anuncia `n`: sirve la tanda completa aunque SM-2 no la tuviera
    // programada, porque el alumno acaba de revisar esa derrota.
    expect(res.rows[0]).toEqual({ n: 2, n_vencidos: 1 });
  });

  it('v_reconocimiento separa lo que reconoce de lo que solo falla', async () => {
    await partida(1);
    await ejercicio(1, 1);
    await client.query(
      `insert into puzzle_attempts (puzzle_id, correct, concepto, concepto_elegido) values
         (1, false, 'cuelga_la_pieza_movida', 'cuelga_la_pieza_movida'),
         (1, false, 'cuelga_la_pieza_movida', 'no_atiendes_la_amenaza'),
         (1, false, 'cuelga_la_pieza_movida', null),
         (1, true,  null, null)`,
    );

    const res = await client.query<{ concepto: string; n: number; reconocidos: number; contestados: number }>(
      'select concepto, n, reconocidos, contestados from v_reconocimiento',
    );
    // 3 fallos, 2 contestados, 1 reconocido. El denominador honesto es `contestados`: leer
    // 1 de 3 castigaria por no contestar, que es otra cosa que no reconocer el error.
    expect(res.rows).toEqual([
      { concepto: 'cuelga_la_pieza_movida', n: 3, reconocidos: 1, contestados: 2 },
    ]);
  });

  it('el reconocimiento cuenta solo rapida, igual que el resto del analisis de errores', async () => {
    await partida(1, { time_class: 'blitz', time_control: '180', base_seconds: 180 });
    await ejercicio(1, 1);
    await client.query(
      "insert into puzzle_attempts (puzzle_id, correct, concepto, concepto_elegido) values (1, false, 'pierde_material', 'pierde_material')",
    );
    const res = await client.query('select * from v_reconocimiento');
    expect(res.rows).toHaveLength(0);
  });
});
