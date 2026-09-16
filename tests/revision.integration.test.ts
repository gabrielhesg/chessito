/**
 * Los cuatro chequeos nuevos de la migracion 0011 y las vistas que introduce.
 *
 * Corren contra el Postgres real de `TEST_DB_URL`, igual que el resto de los
 * `*.integration.test.ts`: son SQL, y el unico lugar donde SQL se puede probar es en un
 * Postgres. Sin `TEST_DB_URL` la suite se salta.
 *
 * Lo que prueban no es que el SQL compile: es que los chequeos **se pongan rojos** con la forma
 * exacta de los datos que la revision integral encontro en produccion y que los diez chequeos
 * viejos no detectaron. Un invariante que nunca se probo en rojo no es un invariante.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('revision integral · migracion 0011', () => {
  let client: Client;

  async function chequeo(nombre: string): Promise<{ ok: boolean; offenders: number }> {
    const res = await client.query<{ ok: boolean; offenders: string }>(
      'select ok, offenders from v_data_quality where check_name = $1',
      [nombre],
    );
    const fila = res.rows[0];
    if (!fila) throw new Error(`El chequeo ${nombre} no existe en v_data_quality`);
    return { ok: fila.ok, offenders: Number.parseInt(fila.offenders, 10) };
  }

  /** Inserta una partida con lo minimo que exige el esquema. */
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
    await client.query('truncate games, moves, puzzles, puzzle_attempts restart identity cascade');
  });

  it('skipped_sin_motivo se pone rojo con una partida normal marcada skipped', async () => {
    // La forma exacta del problema en produccion: una partida de 10 minutos, con sus jugadas
    // extraidas, en estado skipped y sin ningun motivo que lo justifique.
    await partida(1, { analysis_state: 'skipped' });
    await jugada(1, 1);
    await jugada(1, 2);

    const antes = await chequeo('skipped_sin_motivo');
    expect(antes.ok).toBe(false);
    expect(antes.offenders).toBe(1);

    // Y se pone verde cuando la exclusion se nombra.
    await client.query("update games set skip_reason = 'variante' where id = 1");
    expect((await chequeo('skipped_sin_motivo')).ok).toBe(true);
  });

  it('una exclusion legitima no dispara el chequeo', async () => {
    await partida(2, { analysis_state: 'skipped', skip_reason: 'daily', time_class: 'daily', time_control: '1/86400' });
    expect((await chequeo('skipped_sin_motivo')).ok).toBe(true);
  });

  it('la reparacion devuelve a pending solo lo que tiene jugadas y no tiene motivo', async () => {
    await partida(1, { analysis_state: 'skipped' }); // sin motivo, con jugadas -> vuelve
    await jugada(1, 1);
    await partida(2, { analysis_state: 'skipped', skip_reason: 'variante', rules: 'chess960' }); // con motivo -> se queda
    await jugada(2, 1);
    await partida(3, { analysis_state: 'skipped' }); // sin motivo y sin jugadas -> se queda

    await client.query(`update games set analysis_state = 'pending'
                         where analysis_state = 'skipped' and skip_reason is null
                           and exists (select 1 from moves m where m.game_id = games.id)`);

    const res = await client.query<{ id: string; analysis_state: string }>(
      'select id, analysis_state from games order by id',
    );
    expect(res.rows.map((r) => `${r.id}:${r.analysis_state}`)).toEqual([
      '1:pending',
      '2:skipped',
      '3:skipped',
    ]);
  });

  it('v_cobertura_analisis suma su propio n_games, a diferencia de v_analysis_coverage', async () => {
    await partida(1, { analysis_state: 'done' });
    await partida(2, { analysis_state: 'pending' });
    await partida(3, { analysis_state: 'skipped', skip_reason: 'daily' });
    await jugada(1, 1);

    const res = await client.query<{
      n_games: number; n_analyzed: number; n_pending: number;
      n_claimed: number; n_failed: number; n_skipped: number; n_analizables: number;
    }>("select * from v_cobertura_analisis where time_class = 'rapid'");
    const c = res.rows[0];
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.n_analyzed + c.n_pending + c.n_claimed + c.n_failed + c.n_skipped).toBe(c.n_games);
    // El denominador honesto deja fuera lo excluido POR UN MOTIVO.
    expect(c.n_analizables).toBe(2);

    // La vista vieja, en cambio, pierde la fila skipped: es el agujero que dejo invisible el
    // problema durante todo el historico.
    // `v_analysis_coverage` no castea a int, asi que node-pg devuelve sus bigint como texto.
    const vieja = await client.query<Record<string, string>>(
      "select n_games::text, n_analyzed::text, n_pending::text, n_failed::text from v_analysis_coverage where time_class = 'rapid'",
    );
    const v = vieja.rows[0];
    expect(v).toBeDefined();
    if (!v) return;
    const n = (k: string): number => Number.parseInt(v[k] ?? '0', 10);
    expect(n('n_analyzed') + n('n_pending') + n('n_failed')).toBeLessThan(n('n_games'));
  });

  it('cobertura_sesgada_por_clase se pone rojo cuando blitz va mas analizada que rapida', async () => {
    // Exactamente lo que paso: el motor consumio blitz porque claimBatch las empataba y el
    // historico reciente es blitz.
    for (let i = 1; i <= 4; i += 1) await partida(i, { time_class: 'rapid', analysis_state: 'pending' });
    await partida(5, { time_class: 'blitz', time_control: '300', base_seconds: 300, analysis_state: 'done' });
    await partida(6, { time_class: 'blitz', time_control: '300', base_seconds: 300, analysis_state: 'done' });

    expect((await chequeo('cobertura_sesgada_por_clase')).ok).toBe(false);

    for (let i = 1; i <= 4; i += 1) {
      await client.query("update games set analysis_state = 'done' where id = $1", [i]);
    }
    expect((await chequeo('cobertura_sesgada_por_clase')).ok).toBe(true);
  });

  it('fase_final_implausible se pone rojo cuando el umbral de fase esta mal calibrado', async () => {
    await partida(1, { ply_count: 10 });
    // 8 de 10 jugadas propias en "final": es la forma del bug viejo, que dejaba el 62% del
    // historico en fase 2.
    for (let ply = 1; ply <= 20; ply += 2) {
      await jugada(1, ply, { phase: ply <= 16 ? 2 : 1 });
      await jugada(1, ply + 1, { is_mine: false, phase: 1 });
    }
    expect((await chequeo('fase_final_implausible')).ok).toBe(false);

    await client.query('update moves set phase = 1 where is_mine and ply > 4');
    expect((await chequeo('fase_final_implausible')).ok).toBe(true);
  });

  it('v_conceptos_panel cuenta ejercicios distintos y marca el residuo, sin tasa imposible', async () => {
    await partida(1);
    await client.query(
      `insert into puzzles (id, game_id, ply, fen, played_uci, best_uci, cp_loss, win_pct_loss, is_unique)
       values (1, 1, 5, 'fen', 'e2e4', 'd2d4', 300, 30, true), (2, 1, 7, 'fen', 'e2e4', 'd2d4', 300, 30, true)`,
    );
    // Tres intentos del mismo concepto, repartidos en dos ejercicios: el `n` honesto es 2.
    await client.query(
      `insert into puzzle_attempts (puzzle_id, correct, concepto) values
       (1, false, 'pieza_colgada'), (1, false, 'pieza_colgada'), (2, false, 'pieza_colgada'),
       (1, false, 'empeora_la_posicion')`,
    );

    const res = await client.query<{ concepto: string; intentos: number; ejercicios: number; es_residuo: boolean }>(
      'select concepto, intentos, ejercicios, es_residuo from v_conceptos_panel order by concepto',
    );
    expect(res.rows).toEqual([
      { concepto: 'empeora_la_posicion', intentos: 1, ejercicios: 1, es_residuo: true },
      { concepto: 'pieza_colgada', intentos: 3, ejercicios: 2, es_residuo: false },
    ]);

    // La vista no expone ninguna tasa de acierto: la de 0010 solo podia valer 0, porque
    // `concepto` unicamente se escribe al fallar.
    const columnas = await client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'v_conceptos_panel'",
    );
    expect(columnas.rows.map((c) => c.column_name)).not.toContain('aciertos');
  });

  it('v_games_para_refase devuelve solo partidas que ya tienen jugadas', async () => {
    await partida(1);
    await jugada(1, 1);
    await partida(2); // sin jugadas

    // `games.id` es bigserial, asi que node-pg lo devuelve como texto.
    const res = await client.query<{ id: string }>('select id from v_games_para_refase order by id');
    expect(res.rows.map((r) => Number(r.id))).toEqual([1]);
  });
});
