/**
 * `runBuildPuzzles` de punta a punta contra un Postgres de verdad: reusa el mismo fixture y
 * motor falso de `analyze.integration.test.ts` (una derrota grave con negras, cuya jugada del
 * ply 4 es el UNICO blunder classification=3 de is_mine, fuera de libro y no decidido), corre
 * ingest + moves:extract + analyze, y despues `runBuildPuzzles` con un motor MultiPV falso.
 *
 *   TEST_DB_URL=postgresql://... pnpm test
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { PgIngestStore } from '@/lib/ingest/pg-store';
import { runIngest } from '@/lib/ingest/run';
import { runExtractMoves } from '@/lib/ingest/extract-moves';
import { assignOpeningIds, openingRowFromTsv, parseOpeningsTsv } from '@/lib/chess/openings';
import { AnalysisStore } from '@/lib/analysis/store';
import { runAnalyze, type AnalysisEngine } from '@/lib/analysis/run';
import { PuzzleStore } from '@/lib/puzzles/store';
import { runBuildPuzzles, type MultiPvEngine } from '@/lib/puzzles/run';
import { loadFixture, USERNAME } from './fixtures';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const SAMPLE_TSV = join(process.cwd(), 'tests/fixtures/openings-sample.tsv');
const UUID = 'ff8b4f2b-9b30-11ef-ac55-39ed9901000f';

async function resetSchema(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('drop schema public cascade; create schema public;');
    for (const file of readdirSync(MIGRATIONS).sort()) {
      if (!file.endsWith('.sql')) continue;
      await client.query(readFileSync(join(MIGRATIONS, file), 'utf8'));
    }
  } finally {
    await client.end();
  }
}

function fixtureClient(): ChesscomClient {
  const fixture = loadFixture('derrota-grave-con-negras');
  return new ChesscomClient({
    username: USERNAME,
    fetchImpl: (url: string) => {
      if (url.endsWith('/archives')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ archives: [`https://api.chess.com/pub/player/${USERNAME}/games/2024/11`] }),
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ games: [fixture.game] })));
    },
    sleep: () => Promise.resolve(),
  });
}

/** Mismo motor falso que analyze.integration.test.ts: la unica jugada que "empeora" es el ply 4, de negras. */
function fakeAnalysisEngine(): AnalysisEngine {
  return {
    evaluate: (uciMoves) => {
      const k = uciMoves.length;
      const sideToMove: 'white' | 'black' = k % 2 === 0 ? 'white' : 'black';
      const targetWhitePerspective = k >= 4 ? 700 : 0;
      const scoreCp = sideToMove === 'white' ? targetWhitePerspective : -targetWhitePerspective;
      return Promise.resolve({ scoreCp, mateIn: null, bestUci: 'e2e4' });
    },
  };
}

/** Motor MultiPV falso: dos lineas fijas, con la brecha configurable entre la primera y la segunda. */
function fakeMultiPvEngine(gapCp: number): MultiPvEngine {
  return {
    evaluateMultiPv: () =>
      Promise.resolve([
        { scoreCp: 0, mateIn: null, bestUci: 'g1f3' },
        { scoreCp: -gapCp, mateIn: null, bestUci: 'b1c3' },
      ]),
  };
}

suite('runBuildPuzzles contra Postgres real', () => {
  const url = DB_URL as string;
  let ingestStore: PgIngestStore;
  let analysisStore: AnalysisStore;
  let puzzleStore: PuzzleStore;

  beforeAll(async () => {
    await resetSchema(url);
    ingestStore = new PgIngestStore(url);
    analysisStore = new AnalysisStore(url);
    puzzleStore = new PuzzleStore(url);

    const openings = assignOpeningIds(
      parseOpeningsTsv(readFileSync(SAMPLE_TSV, 'utf8')).map(openingRowFromTsv),
    );
    await ingestStore.insertOpenings(openings);

    await runIngest({
      store: ingestStore,
      client: fixtureClient(),
      username: USERNAME,
      environment: 'test',
      trigger: 'manual',
      scope: { kind: 'full' },
    });
    await runExtractMoves({ store: ingestStore, environment: 'test', trigger: 'manual' });
    await runAnalyze({
      store: analysisStore,
      engine: fakeAnalysisEngine(),
      engineId: 'motor-falso-test',
      nodes: 1,
      batchSize: 10,
      environment: 'test',
      trigger: 'manual',
    });
  }, 60_000);

  afterAll(async () => {
    await ingestStore.close();
    await analysisStore.close();
    await puzzleStore.close();
  });

  it('con una segunda linea lejos, crea el ejercicio con is_unique=true', async () => {
    const summary = await runBuildPuzzles({
      store: puzzleStore,
      engine: fakeMultiPvEngine(300), // 300cp de brecha: bastante mas de los 10 puntos de win%
      nodes: 1,
      batchSize: 10,
      environment: 'test',
      trigger: 'manual',
    });

    expect(summary.status).toBe('success');
    expect(summary.failed).toBe(0);
    expect(summary.processed).toBe(1);

    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ ply: number; is_unique: boolean; best_uci: string; fen: string }>(
        `select p.ply, p.is_unique, p.best_uci, p.fen
           from puzzles p
           join games g on g.id = p.game_id
          where g.chesscom_uuid = $1`,
        [UUID],
      );
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.ply).toBe(4);
      expect(res.rows[0]?.is_unique).toBe(true);
      expect(res.rows[0]?.best_uci).toBe('g1f3');
      expect(res.rows[0]?.fen).toContain(' b '); // le toca mover a negras: es su blunder
    } finally {
      await client.end();
    }
  }, 30_000);

  it('correrla de nuevo no duplica el ejercicio (idempotencia: no_exists + on conflict)', async () => {
    const segunda = await runBuildPuzzles({
      store: puzzleStore,
      engine: fakeMultiPvEngine(300),
      nodes: 1,
      batchSize: 10,
      environment: 'test',
      trigger: 'manual',
    });
    expect(segunda.processed).toBe(0);

    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ n: string }>('select count(*)::text as n from puzzles');
      expect(res.rows[0]?.n).toBe('1');
    } finally {
      await client.end();
    }
  });

  it('registra la corrida en job_runs con kind puzzles', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ status: string }>("select status from job_runs where kind = 'puzzles'");
      expect(res.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of res.rows) expect(row.status).toBe('success');
    } finally {
      await client.end();
    }
  });

  it('con una segunda linea cerca, el filtro MultiPV marca is_unique=false y no se sirve', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      await client.query('delete from puzzles');
    } finally {
      await client.end();
    }

    const summary = await runBuildPuzzles({
      store: puzzleStore,
      engine: fakeMultiPvEngine(5), // 5cp de brecha: bien dentro del umbral de 10 puntos de win%
      nodes: 1,
      batchSize: 10,
      environment: 'test',
      trigger: 'manual',
    });
    expect(summary.processed).toBe(1);

    const client2 = new Client({ connectionString: url });
    await client2.connect();
    try {
      const res = await client2.query<{ is_unique: boolean }>('select is_unique from puzzles');
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0]?.is_unique).toBe(false);

      const servibles = await client2.query<{ n: string }>(
        'select count(*)::text as n from puzzles where is_unique and due_at <= now()',
      );
      expect(servibles.rows[0]?.n).toBe('0');
    } finally {
      await client2.end();
    }
  }, 30_000);
});
