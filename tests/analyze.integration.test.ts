/**
 * `runAnalyze` de punta a punta contra un Postgres de verdad: ingiere un fixture real (una
 * derrota grave con negras, docs/CONFIANZA.md capa 1), corre `moves:extract`, y despues
 * `runAnalyze` con un motor FALSO deterministico (sin Stockfish real) que simula una partida
 * donde blancas mejora su posicion en cada jugada.
 *
 * Es el chequeo end-to-end del bug de los dos pasos de signo: con el motor falso, TODAS las
 * jugadas de blancas "mejoran" (perdida 0) y TODAS las de negras "empeoran" (perdida positiva).
 * Si el paso 2 de signo estuviera mal, las jugadas de negras con perdida real quedarian en
 * classification 0 y desaparecerian del analisis. Este test falla si eso pasa.
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
import { loadFixture, USERNAME } from './fixtures';

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

/**
 * Motor falso: la evaluacion (en perspectiva de blancas) queda en 0 hasta la posicion 3
 * (fin del libro, que en esta partida resuelve a "King's Pawn Game", ply_count 2), y despues
 * de la jugada del ply 4 —una jugada de NEGRAS— salta a +700 y se queda ahi. O sea: la unica
 * jugada que "empeora" la posicion en toda la partida es esa jugada de negras, a proposito,
 * para poder afirmar el resultado exacto sin depender de que Stockfish este instalado.
 */
function fakeEngine(): AnalysisEngine {
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

suite('runAnalyze contra Postgres real', () => {
  const url = DB_URL as string;
  let ingestStore: PgIngestStore;
  let analysisStore: AnalysisStore;

  beforeAll(async () => {
    await resetSchema(url);
    ingestStore = new PgIngestStore(url);
    analysisStore = new AnalysisStore(url);

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
  }, 60_000);

  afterAll(async () => {
    await ingestStore.close();
    await analysisStore.close();
  });

  it('analiza la partida y marca analysis_state = done', async () => {
    const summary = await runAnalyze({
      store: analysisStore,
      engine: fakeEngine(),
      engineId: 'motor-falso-test',
      nodes: 1,
      batchSize: 10,
      environment: 'test',
      trigger: 'manual',
    });

    expect(summary.status).toBe('success');
    expect(summary.failed).toBe(0);
    expect(summary.processed).toBe(1);
  }, 30_000);

  it('la jugada de negras que colgo la partida NO desaparece en classification 0 (chequeo del bug de signos)', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ ply: number; is_mine: boolean; classification: number; win_pct_loss: number }>(
        `select m.ply, m.is_mine, m.classification, m.win_pct_loss
           from moves m
           join games g on g.id = m.game_id
          where g.chesscom_uuid = 'ff8b4f2b-9b30-11ef-ac55-39ed9901000f'
            and m.classification is not null
          order by m.ply`,
      );
      expect(res.rows.length).toBeGreaterThan(0);

      // El motor falso deja el eval en 0 hasta la jugada del ply 4 (de NEGRAS, is_mine=true en
      // esta partida) y ahi salta a +700 en perspectiva de blancas: es la UNICA jugada de toda
      // la partida que "empeora" la posicion. Si el paso 2 de signo estuviera mal (perdida
      // calculada sin girar segun quien movio), esta jugada de negras daria perdida negativa,
      // el clamp la dejaria en 0, y classification tambien en 0 — exactamente lo que este test
      // descarta.
      const ply4 = res.rows.find((row) => row.ply === 4);
      expect(ply4?.is_mine).toBe(true);
      expect(ply4?.win_pct_loss).toBeGreaterThan(30);
      expect(ply4?.classification).toBe(3);

      // Todas las demas jugadas (blancas, y negras despues del salto, donde el eval ya no se
      // mueve) quedan en classification 0: confirma que el test distingue una jugada real de
      // las demas, y no que classify() siempre devuelve algo mayor que 0.
      for (const row of res.rows) {
        if (row.ply === 4) continue;
        expect(row.classification).toBe(0);
      }
    } finally {
      await client.end();
    }
  });

  it('calcula divergence_ply en la perspectiva de Gabriel (negras), no en la de blancas', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ divergence_ply: number | null; analysis_state: string }>(
        `select divergence_ply, analysis_state from games where chesscom_uuid = 'ff8b4f2b-9b30-11ef-ac55-39ed9901000f'`,
      );
      expect(res.rows[0]?.analysis_state).toBe('done');
      // El eval (perspectiva blancas) salta a +700 justo despues de la jugada del ply 4 y se
      // queda ahi: en la perspectiva de Gabriel (negras) es -700, cruza -100 en el ply 4 y
      // nunca se recupera sobre -50.
      expect(res.rows[0]?.divergence_ply).toBe(4);
    } finally {
      await client.end();
    }
  });

  it('registra la corrida en job_runs con kind analyze', async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const res = await client.query<{ status: string }>("select status from job_runs where kind = 'analyze'");
      expect(res.rows.length).toBeGreaterThanOrEqual(1);
      for (const row of res.rows) expect(row.status).toBe('success');
    } finally {
      await client.end();
    }
  });

  it('correrla de nuevo no encuentra partidas pendientes (idempotencia)', async () => {
    const segunda = await runAnalyze({
      store: analysisStore,
      engine: fakeEngine(),
      engineId: 'motor-falso-test',
      nodes: 1,
      batchSize: 10,
      environment: 'test',
      trigger: 'manual',
    });
    expect(segunda.processed).toBe(0);
    expect(segunda.remaining).toBe(0);
  });
});
