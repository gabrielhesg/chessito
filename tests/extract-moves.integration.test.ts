/**
 * `moves:extract` de punta a punta contra un Postgres de verdad: ingiere los fixtures reales,
 * corre `runExtractMoves`, y verifica idempotencia y la reconstruccion del reloj (aceptacion
 * de docs/prompts/fase2-reloj.md).
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
import { allFixtures, USERNAME } from './fixtures';

const DB_URL = process.env['TEST_DB_URL'];
const suite = DB_URL ? describe : describe.skip;

const MIGRATIONS = join(process.cwd(), 'supabase/migrations');
const SAMPLE_TSV = join(process.cwd(), 'tests/fixtures/openings-sample.tsv');

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
  const fixtures = allFixtures();
  return new ChesscomClient({
    username: USERNAME,
    fetchImpl: (url: string) => {
      if (url.endsWith('/archives')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ archives: [`https://api.chess.com/pub/player/${USERNAME}/games/2026/08`] }),
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ games: fixtures.map((f) => f.game) })));
    },
    sleep: () => Promise.resolve(),
  });
}

suite('moves:extract contra Postgres real', () => {
  const url = DB_URL as string;
  let store: PgIngestStore;

  beforeAll(async () => {
    await resetSchema(url);
    store = new PgIngestStore(url);
    const openings = assignOpeningIds(
      parseOpeningsTsv(readFileSync(SAMPLE_TSV, 'utf8')).map(openingRowFromTsv),
    );
    await store.insertOpenings(openings);
    await runIngest({
      store,
      client: fixtureClient(),
      username: USERNAME,
      environment: 'test',
      trigger: 'manual',
      scope: { kind: 'full' },
    });
  }, 60_000);

  afterAll(async () => {
    await store.close();
  });

  it('puebla moves para todas las partidas con PGN reproducible', async () => {
    const summary = await runExtractMoves({ store, environment: 'test', trigger: 'manual' });

    expect(summary.status).toBe('success');
    expect(summary.failed).toBe(0);
    // Los fixtures 'skipped' (correspondencia real y sin %clk) no entran a moves:extract.
    const skippedFixtures = 2;
    expect(summary.processed).toBe(allFixtures().length - skippedFixtures);
  }, 60_000);

  it('correrla dos veces no encuentra nada pendiente (idempotencia)', async () => {
    const segunda = await runExtractMoves({ store, environment: 'test', trigger: 'manual' });
    expect(segunda.processed).toBe(0);
    expect(segunda.failed).toBe(0);
  }, 60_000);

  it('ninguna fila de moves tiene move_time_ms negativo', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ n: string }>(
        'select count(*)::text as n from moves where move_time_ms < 0',
      );
      expect(res.rows[0]?.n).toBe('0');
    } finally {
      await client.end();
    }
  });

  it('reconstruye base_seconds para la partida real con incremento (15+10)', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{
        base_seconds: number;
        increment_secs: number;
        sum_used: string;
        last_clock: number;
        n_mine: string;
      }>(
        `select g.base_seconds, g.increment_secs,
                sum(m.move_time_ms)::text as sum_used,
                (array_agg(m.clock_ms order by m.ply desc))[1] as last_clock,
                count(*)::text as n_mine
           from games g
           join moves m on m.game_id = g.id and m.is_mine
          where g.chesscom_uuid = '6683248a-ebf9-11f0-8af9-54b7ba01000f'
          group by g.id`,
      );
      const row = res.rows[0];
      expect(row).toBeDefined();
      if (!row) return;
      const incrementMs = row.increment_secs * 1000;
      const reconstructed = Number(row.sum_used) + row.last_clock - Number(row.n_mine) * incrementMs;
      expect(Math.abs(reconstructed - row.base_seconds * 1000)).toBeLessThan(2000);
    } finally {
      await client.end();
    }
  });

  it('registra la corrida en job_runs con kind extract_moves', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ status: string; processed: number }>(
        "select status, processed from job_runs where kind = 'extract_moves' order by id",
      );
      expect(res.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of res.rows) expect(row.status).toBe('success');
    } finally {
      await client.end();
    }
  });
});
