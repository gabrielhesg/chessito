/**
 * Elegir una partida desde el entrenador: el motor la analiza primero, y nunca analiza una sin
 * jugadas extraídas.
 *
 * Las dos cosas se prueban contra Postgres real porque las dos son SQL de `claimBatch` y
 * `claimBlunderCandidates`, y el orden de un `order by` no se puede probar en memoria.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AnalysisStore } from '@/lib/analysis/store';
import { PuzzleStore } from '@/lib/puzzles/store';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;
const MIGRATIONS = join(process.cwd(), 'supabase/migrations');

suite('partida elegida desde el entrenador', () => {
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
      analysis_state: 'pending',
      ...campos,
    };
    const cols = Object.keys(base);
    await client.query(
      `insert into games (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => base[c]),
    );
  }

  async function jugadas(gameId: number, campos: Record<string, unknown> = {}): Promise<void> {
    for (const ply of [1, 2]) {
      const base: Record<string, unknown> = {
        game_id: gameId,
        ply,
        is_mine: ply === 1,
        san: ply === 1 ? 'e4' : 'e5',
        uci: ply === 1 ? 'e2e4' : 'e7e5',
        phase: 0,
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

  it('nunca reclama una partida sin jugadas extraídas', async () => {
    // El bug de la Fase 2: una partida sin `moves` se guardaba como `done` con cero jugadas
    // analizadas. Antes lo evitaba solo el orden de los workflows; ahora el analizador mismo.
    await partida(1);
    await partida(2);
    await jugadas(2);

    const store = new AnalysisStore(DB_URL as string);
    try {
      const reclamadas = await store.claimBatch(10);
      expect(reclamadas.map((g) => Number(g.id))).toEqual([2]);
    } finally {
      await store.close();
    }

    const estado = await client.query<{ analysis_state: string }>('select analysis_state from games where id = 1');
    expect(estado.rows[0]?.analysis_state).toBe('pending');
  });

  it('la partida elegida va primera, aunque sea de bala y haya rápida y blitz en cola', async () => {
    // Sin la prioridad, la cola va rápida → blitz → bala, y una de bala recién jugada quedaría
    // detrás de todo. Es exactamente el caso de "acabo de jugar esta y la quiero ver".
    await partida(1, { time_class: 'rapid' });
    await jugadas(1);
    await partida(2, { time_class: 'blitz', time_control: '180', base_seconds: 180 });
    await jugadas(2);
    await partida(3, { time_class: 'bullet', time_control: '60', base_seconds: 60 });
    await jugadas(3);

    const store = new AnalysisStore(DB_URL as string);
    try {
      // Lote de UNO: si la prioridad no funcionara, saldría la de rápida.
      const reclamadas = await store.claimBatch(1, 3);
      expect(reclamadas.map((g) => Number(g.id))).toEqual([3]);
    } finally {
      await store.close();
    }
  });

  it('sin partida elegida, la cola sigue siendo rápida primero', async () => {
    await partida(1, { time_class: 'bullet', time_control: '60', base_seconds: 60 });
    await jugadas(1);
    await partida(2, { time_class: 'rapid' });
    await jugadas(2);

    const store = new AnalysisStore(DB_URL as string);
    try {
      const reclamadas = await store.claimBatch(1);
      expect(reclamadas.map((g) => Number(g.id))).toEqual([2]);
    } finally {
      await store.close();
    }
  });

  it('elegir una partida ya analizada no la vuelve a analizar', async () => {
    await partida(1, { analysis_state: 'done' });
    await jugadas(1);
    await partida(2);
    await jugadas(2);

    const store = new AnalysisStore(DB_URL as string);
    try {
      // La elegida no está pendiente: el lote sigue con la cola normal.
      const reclamadas = await store.claimBatch(10, 1);
      expect(reclamadas.map((g) => Number(g.id))).toEqual([2]);
    } finally {
      await store.close();
    }
  });

  it('los blunders de la partida elegida van primero al construir ejercicios', async () => {
    // Sin esto, elegir una partida vieja no sirve: el lote de 200 se llena con blunders más
    // recientes y los suyos esperan días. La 1 es la MÁS reciente; la elegida es la 2.
    const blunder = { classification: 3, cp_loss: 400, win_pct_loss: 35 };
    await partida(1, { analysis_state: 'done' });
    await jugadas(1, blunder);
    await partida(2, { analysis_state: 'done' });
    await jugadas(2, blunder);

    const store = new PuzzleStore(DB_URL as string);
    try {
      const candidatos = await store.claimBlunderCandidates(1, 2);
      expect(candidatos.map((c) => Number(c.gameId))).toEqual([2]);

      const sinElegir = await store.claimBlunderCandidates(1);
      expect(sinElegir.map((c) => Number(c.gameId))).toEqual([1]);
    } finally {
      await store.close();
    }
  });
});
