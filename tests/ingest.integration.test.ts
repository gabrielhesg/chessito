/**
 * Ingesta de punta a punta contra un Postgres de verdad, con el esquema real.
 *
 * Corre solo si hay `TEST_DB_URL`. Sin ella se salta con un aviso, para que la CI publica
 * (que no tiene base de datos) no se ponga roja por algo que no puede ejecutar.
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

/** Cliente de chess.com que sirve los fixtures en vez de salir a la red. */
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
      return Promise.resolve(
        new Response(JSON.stringify({ games: fixtures.map((f) => f.game) })),
      );
    },
    sleep: () => Promise.resolve(),
  });
}

suite('ingesta contra Postgres real', () => {
  const url = DB_URL as string;
  let store: PgIngestStore;

  beforeAll(async () => {
    await resetSchema(url);
    store = new PgIngestStore(url);
    const openings = assignOpeningIds(
      parseOpeningsTsv(readFileSync(SAMPLE_TSV, 'utf8')).map(openingRowFromTsv),
    );
    await store.insertOpenings(openings);
  }, 60_000);

  afterAll(async () => {
    await store.close();
  });

  it('guarda las partidas, resuelve aperturas y reconcilia', async () => {
    const summary = await runIngest({
      store,
      client: fixtureClient(),
      username: USERNAME,
      environment: 'test',
      trigger: 'manual',
      scope: { kind: 'full' },
    });

    expect(summary.status).toBe('success');
    expect(summary.failed).toBe(0);
    expect(summary.processed).toBe(allFixtures().length);
    expect(summary.reconciliationOk).toBe(true);
    expect(summary.reconciliation[0]?.missing).toBe(0);
    // La correspondencia y la partida sin reloj quedan fuera del analisis.
    expect(summary.skipped).toBe(2);
  }, 60_000);

  it('correrla dos veces no cambia nada (idempotencia por chesscom_uuid)', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const snapshot = async (): Promise<string> => {
        const res = await client.query<{ huella: string }>(
          `select count(*) || '|' || coalesce(md5(string_agg(
             chesscom_uuid || result || score || coalesce(opening_id, '') ||
             coalesce(session_id::text, '') || coalesce(game_in_session::text, ''),
             '' order by chesscom_uuid)), '') as huella
           from games`,
        );
        return res.rows[0]?.huella ?? '';
      };

      const antes = await snapshot();
      await runIngest({
        store,
        client: fixtureClient(),
        username: USERNAME,
        environment: 'test',
        trigger: 'manual',
        scope: { kind: 'full' },
      });
      expect(await snapshot()).toBe(antes);
    } finally {
      await client.end();
    }
  }, 60_000);

  it('registra cada corrida en job_runs con sus conteos', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{
        kind: string;
        status: string;
        environment: string;
        trigger: string;
        processed: number;
        duration_ms: number;
      }>('select kind, status, environment, trigger, processed, duration_ms from job_runs order by id');
      expect(res.rows.length).toBeGreaterThanOrEqual(2);
      for (const row of res.rows) {
        expect(row.kind).toBe('ingest');
        expect(row.status).toBe('success');
        expect(row.environment).toBe('test');
        expect(row.processed).toBe(allFixtures().length);
        expect(row.duration_ms).toBeGreaterThanOrEqual(0);
      }
    } finally {
      await client.end();
    }
  });

  it('los diez chequeos de v_data_quality quedan en verde', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ check_name: string; ok: boolean }>(
        'select check_name, ok from v_data_quality',
      );
      expect(res.rows).toHaveLength(10);
      expect(res.rows.filter((r) => !r.ok)).toEqual([]);
    } finally {
      await client.end();
    }
  });

  it('una partida que no se puede mapear no mata la corrida', async () => {
    const rota = {
      ...allFixtures()[0]!.game,
      uuid: 'partida-rota',
      pgn: '[Event "x"]\n\n1. e4 e5 2. Qxd8 1-0',
    };
    const client = new ChesscomClient({
      username: USERNAME,
      fetchImpl: (url: string) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              url.endsWith('/archives')
                ? { archives: [`https://api.chess.com/pub/player/${USERNAME}/games/2026/08`] }
                : { games: [rota, allFixtures()[1]!.game] },
            ),
          ),
        ),
      sleep: () => Promise.resolve(),
    });

    const summary = await runIngest({
      store,
      client,
      username: USERNAME,
      environment: 'test',
      trigger: 'manual',
      scope: { kind: 'full' },
    });

    expect(summary.failed).toBe(1);
    expect(summary.failures[0]?.uuid).toBe('partida-rota');
    expect(summary.processed).toBe(1);
    // La partida perdida se ve en la reconciliacion: chess.com la reporta y no quedo guardada.
    expect(summary.reconciliationOk).toBe(false);
    expect(summary.status).toBe('failed');
  }, 60_000);
});
