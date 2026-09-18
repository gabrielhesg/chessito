/**
 * La divergencia por linea de repertorio (migracion 0018).
 *
 * Lo que se fija es el denominador: `mediana_ply` va sobre las partidas que SI divergieron, no
 * sobre todas. Meter como ceros las que nunca cayeron bajo -100 cp adelantaria la mediana; dejar
 * de contarlas en `n` escondería cuantas veces la linea si aguanto. Por eso conviven `n` y
 * `n_diverged`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('divergencia por repertorio · migracion 0018', () => {
  let client: Client;

  async function partida(id: number, campos: Record<string, unknown> = {}): Promise<void> {
    const base: Record<string, unknown> = {
      id,
      chesscom_uuid: `uuid-${id}`,
      url: `https://example.test/${id}`,
      end_time: new Date(Date.now() - id * 3600_000).toISOString(),
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

  /** Las tres jugadas que definen el Ponziani, para que la partida calce con la entrada. */
  async function ponziani(gameId: number): Promise<void> {
    const jugadas: [number, string][] = [[1, 'e4'], [2, 'e5'], [3, 'Nf3'], [4, 'Nc6'], [5, 'c3']];
    for (const [ply, san] of jugadas) {
      await client.query(
        `insert into moves (game_id, ply, is_mine, san, uci, phase, is_book, is_decided)
         values ($1, $2, $3, $4, 'e2e4', 0, true, false)`,
        [gameId, ply, ply % 2 === 1, san],
      );
    }
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

  it('la mediana se calcula sobre las que divergieron, no sobre todas', async () => {
    // Tres partidas de Ponziani: dos se tuercen (plies 20 y 40) y una nunca.
    await partida(1, { divergence_ply: 20 });
    await ponziani(1);
    await partida(2, { divergence_ply: 40 });
    await ponziani(2);
    await partida(3, { divergence_ply: null, result: 'win', score: 1, termination: 'checkmate' });
    await ponziani(3);

    const res = await client.query<{ n: number; n_diverged: number; mediana_ply: string }>(
      `select n, n_diverged, mediana_ply::text from v_repertorio_divergencia
        where repertorio_id = 'ponziani'`,
    );
    expect(res.rows[0]?.n).toBe(3);
    expect(res.rows[0]?.n_diverged).toBe(2);
    // Mediana de 20 y 40 = 30. Si la tercera contara como 0, seria 20; si contara como "nunca"
    // con un valor alto, subiria. Las dos serian mentira.
    expect(Number(res.rows[0]?.mediana_ply)).toBe(30);
  });

  it('una partida sin analizar no entra: `divergence_ply` solo existe tras el motor', async () => {
    await partida(1, { divergence_ply: null, analysis_state: 'pending' });
    await ponziani(1);
    const res = await client.query('select * from v_repertorio_divergencia');
    expect(res.rows).toHaveLength(0);
  });
});
