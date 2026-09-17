/**
 * Fase 3 de la revision · Las dos debilidades, medidas (migracion 0015).
 *
 * Los dos tests que el criterio de aceptacion exige por nombre, y que son los dos lugares donde
 * esta fase se puede equivocar en silencio:
 *
 *   1. PVR normalizado por jugada. Sin dividir, una partida larga "regala" mas que una corta
 *      aunque se juegue igual, y la metrica termina premiando perder rapido.
 *   2. El signo con negras. `moves.eval_cp` esta en perspectiva de blancas (trampa 2 de
 *      CLAUDE.md); sin girarlo por `my_color`, "llegaste a +200" mide las partidas donde el RIVAL
 *      estaba mejor, en la mitad del historico y sin avisar.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('debilidades medidas · migracion 0015', () => {
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

  async function jugada(gameId: number, ply: number, campos: Record<string, unknown> = {}): Promise<void> {
    const base: Record<string, unknown> = {
      game_id: gameId,
      ply,
      is_mine: ply % 2 === 1,
      san: 'e4',
      uci: 'e2e4',
      phase: 1,
      is_book: false,
      is_decided: false,
      ...campos,
    };
    const cols = Object.keys(base);
    await client.query(
      `insert into moves (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => base[c]),
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
    await client.query('truncate games, moves, puzzles, puzzle_attempts, game_reviews restart identity cascade');
  });

  it('PVR no castiga a la partida larga: misma calidad por jugada, mismo valor', async () => {
    // Dos partidas con exactamente la misma calidad (4 puntos de win% por jugada propia) y
    // distinto largo: 10 jugadas propias contra 40. Sin normalizar, la larga "regalaria" 160
    // contra 40 y saldria cuatro veces peor.
    await partida(1);
    for (let ply = 1; ply <= 20; ply += 2) await jugada(1, ply, { win_pct_loss: 4, classification: 0 });
    await partida(2);
    for (let ply = 1; ply <= 80; ply += 2) await jugada(2, ply, { win_pct_loss: 4, classification: 0 });

    const res = await client.query<{ game_id: number; por_jugada: number; jugadas: number }>(
      `select game_id::int as game_id, jugadas_propias as jugadas,
              (win_pct_perdido / jugadas_propias)::real as por_jugada
         from v_piezas_colgadas_por_partida order by game_id`,
    );
    expect(res.rows.map((r) => r.jugadas)).toEqual([10, 40]);
    expect(res.rows[0]?.por_jugada).toBeCloseTo(4, 5);
    expect(res.rows[1]?.por_jugada).toBeCloseTo(4, 5);

    const ns = await client.query<{ pvr_por_jugada: number }>('select pvr_por_jugada from v_north_star');
    expect(ns.rows[0]?.pvr_por_jugada).toBeCloseTo(4, 5);
  });

  it('la ventaja se mide en TU perspectiva: con negras, -300 es +300 tuyo', async () => {
    // Con negras, una evaluacion de -300 (perspectiva de blancas) significa que TU estas mejor.
    // Sin el giro, esta partida no aparece como ventaja y el analisis pierde la mitad del
    // historico en silencio.
    await partida(1, { my_color: 'black' });
    await jugada(1, 1, { eval_cp: -50, is_mine: false });
    await jugada(1, 2, { eval_cp: -300, is_mine: true });
    await jugada(1, 3, { eval_cp: 20, is_mine: false });

    const res = await client.query<{ ventaja_maxima: number; ply_perdida: number | null }>(
      'select ventaja_maxima, ply_perdida from v_ventaja_por_partida where game_id = 1',
    );
    expect(res.rows[0]?.ventaja_maxima).toBe(300);
    // Y la solto en el ply 3, que es donde su ventaja vuelve a estar bajo 50.
    expect(res.rows[0]?.ply_perdida).toBe(3);
  });

  it('con blancas el signo no se toca, y las dos partidas conviven en la misma vista', async () => {
    await partida(1, { my_color: 'white' });
    await jugada(1, 1, { eval_cp: 400, is_mine: true });
    await partida(2, { my_color: 'black' });
    await jugada(2, 1, { eval_cp: 400, is_mine: false });

    const res = await client.query<{ game_id: number; ventaja_maxima: number }>(
      'select game_id::int as game_id, ventaja_maxima from v_ventaja_por_partida order by game_id',
    );
    // La misma evaluacion cruda, +400, es ventaja suya con blancas y del rival con negras.
    expect(res.rows).toEqual([
      { game_id: 1, ventaja_maxima: 400 },
      { game_id: 2, ventaja_maxima: -400 },
    ]);
  });

  it('un regalo del rival cuenta como cobrado solo si la jugada siguiente no lo devuelve', async () => {
    // Partida 1: el rival regala (+500 a mi favor) y yo lo mantengo.
    await partida(1);
    await jugada(1, 1, { eval_cp: 0, is_mine: true, classification: 0 });
    await jugada(1, 2, { eval_cp: 500, is_mine: false, classification: 3 });
    await jugada(1, 3, { eval_cp: 480, is_mine: true, classification: 0 });
    // Partida 2: el rival regala igual y yo lo devuelvo entero.
    await partida(2);
    await jugada(2, 1, { eval_cp: 0, is_mine: true, classification: 0 });
    await jugada(2, 2, { eval_cp: 500, is_mine: false, classification: 3 });
    await jugada(2, 3, { eval_cp: 10, is_mine: true, classification: 3 });

    const res = await client.query<{ game_id: number; aprovechado: boolean }>(
      'select game_id::int as game_id, aprovechado from v_regalos_del_rival order by game_id',
    );
    expect(res.rows).toEqual([
      { game_id: 1, aprovechado: true },
      { game_id: 2, aprovechado: false },
    ]);
  });

  it('el corte de cp_loss separa piezas colgadas de graves cuando hay de las dos', async () => {
    await partida(1);
    await jugada(1, 1, { classification: 3, cp_loss: 600, win_pct_loss: 40 });
    await jugada(1, 3, { classification: 3, cp_loss: 120, win_pct_loss: 31 });

    const res = await client.query<{ piezas_colgadas: number; graves: number }>(
      'select piezas_colgadas, graves from v_piezas_colgadas_por_partida where game_id = 1',
    );
    // En los datos reales de produccion el corte hoy no excluye ninguna (el minimo es 339), pero
    // la vista tiene que saber distinguirlas el dia que aparezca una: por eso conviven las dos
    // columnas en vez de una sola.
    expect(res.rows[0]).toEqual({ piezas_colgadas: 1, graves: 2 });
  });

  it('la serie mensual expone su n, para que la portada pueda atenuar los meses flacos', async () => {
    await partida(1, { end_time: '2026-03-15T12:00:00Z' });
    await jugada(1, 1, { classification: 3, cp_loss: 600, win_pct_loss: 40 });
    await partida(2, { end_time: '2026-03-20T12:00:00Z' });
    await jugada(2, 1, { classification: 0, cp_loss: 10, win_pct_loss: 2 });

    const res = await client.query<{ month_local: string; n: number; piezas_por_partida: number }>(
      'select month_local, n, piezas_por_partida from v_north_star_mensual',
    );
    expect(res.rows[0]?.month_local).toBe('2026-03');
    expect(res.rows[0]?.n).toBe(2);
    expect(res.rows[0]?.piezas_por_partida).toBeCloseTo(0.5, 5);
  });
});
