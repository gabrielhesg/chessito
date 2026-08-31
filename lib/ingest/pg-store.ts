import { Client } from 'pg';
import type { GameRow } from '@/lib/chess/game';
import type { IngestStore, JobRunInput, JobRunResult, OpeningIndexEntry, OpeningInsert } from './store';

/**
 * Implementacion por conexion directa a Postgres (`SUPABASE_DB_URL`).
 *
 * La usan los procesos batch (`pnpm ingest`, `pnpm openings:load`, GitHub Actions) porque
 * mueven miles de filas y una conexion directa cuesta una fraccion de lo que cuesta PostgREST.
 * La app en Vercel no la puede usar y no la necesita: alli corre `SupabaseIngestStore`.
 *
 * Las dos implementaciones comparten el esquema y la misma funcion SQL de sesiones, asi que
 * no hay dos versiones de la logica, solo dos transportes.
 */
const GAME_COLUMNS = [
  'chesscom_uuid',
  'url',
  'end_time',
  'time_class',
  'time_control',
  'base_seconds',
  'increment_secs',
  'rules',
  'my_color',
  'my_rating',
  'opp_rating',
  'opp_username',
  'result',
  'score',
  'termination',
  'my_accuracy',
  'opening_id',
  'opening_eco_cc',
  'opening_url_cc',
  'ply_count',
  'pgn',
  'analysis_state',
] as const;

export class PgIngestStore implements IngestStore {
  private readonly client: Client;
  private connected = false;

  constructor(connectionString: string) {
    this.client = new Client({ connectionString });
  }

  private async connect(): Promise<Client> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
    }
    return this.client;
  }

  async loadOpeningIndex(): Promise<Map<string, OpeningIndexEntry>> {
    const client = await this.connect();
    const res = await client.query<{ id: string; epd: string; ply_count: number }>(
      'select id, epd, ply_count from openings',
    );
    return new Map(res.rows.map((r) => [r.epd, { id: r.id, plyCount: r.ply_count }]));
  }

  async upsertGames(rows: GameRow[]): Promise<void> {
    if (rows.length === 0) return;
    const client = await this.connect();

    const values: unknown[] = [];
    const tuples = rows.map((row, rowIndex) => {
      const placeholders = GAME_COLUMNS.map((_, colIndex) => `$${rowIndex * GAME_COLUMNS.length + colIndex + 1}`);
      for (const column of GAME_COLUMNS) values.push(row[column]);
      return `(${placeholders.join(',')})`;
    });

    // El upsert NO pisa analysis_state ni las columnas del motor: reingerir una partida ya
    // analizada no puede borrar su analisis. Por eso la ingesta es idempotente de verdad.
    const updates = GAME_COLUMNS.filter((c) => c !== 'chesscom_uuid' && c !== 'analysis_state')
      .map((c) => `${c} = excluded.${c}`)
      .join(', ');

    await client.query(
      `insert into games (${GAME_COLUMNS.join(',')}) values ${tuples.join(',')}
       on conflict (chesscom_uuid) do update set ${updates}`,
      values,
    );
  }

  async insertOpenings(rows: OpeningInsert[]): Promise<void> {
    if (rows.length === 0) return;
    const client = await this.connect();
    const values: unknown[] = [];
    const tuples = rows.map((row, index) => {
      values.push(row.id, row.eco, row.name, row.pgn, row.epd, row.ply_count);
      const base = index * 6;
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`;
    });
    await client.query(
      `insert into openings (id, eco, name, pgn, epd, ply_count) values ${tuples.join(',')}
       on conflict (epd) do nothing`,
      values,
    );
  }

  async countOpenings(): Promise<number> {
    const client = await this.connect();
    const res = await client.query<{ n: string }>('select count(*)::text as n from openings');
    return Number.parseInt(res.rows[0]?.n ?? '0', 10);
  }

  async recomputeSessionFeatures(): Promise<void> {
    const client = await this.connect();
    await client.query('select recompute_session_features()');
  }

  async findExistingUuids(uuids: string[]): Promise<Set<string>> {
    if (uuids.length === 0) return new Set();
    const client = await this.connect();
    const res = await client.query<{ chesscom_uuid: string }>(
      'select chesscom_uuid from games where chesscom_uuid = any($1::text[])',
      [uuids],
    );
    return new Set(res.rows.map((r) => r.chesscom_uuid));
  }

  async countPendingAnalysis(): Promise<number> {
    const client = await this.connect();
    const res = await client.query<{ n: string }>(
      "select count(*)::text as n from games where analysis_state = 'pending'",
    );
    return Number.parseInt(res.rows[0]?.n ?? '0', 10);
  }

  async startJobRun(input: JobRunInput): Promise<number> {
    const client = await this.connect();
    const res = await client.query<{ id: string }>(
      `insert into job_runs (kind, status, environment, trigger)
       values ($1, 'running', $2, $3) returning id::text`,
      [input.kind, input.environment, input.trigger],
    );
    return Number.parseInt(res.rows[0]?.id ?? '0', 10);
  }

  async finishJobRun(id: number, result: JobRunResult): Promise<void> {
    const client = await this.connect();
    await client.query(
      `update job_runs
          set status = $2,
              finished_at = now(),
              duration_ms = extract(epoch from (now() - started_at)) * 1000,
              processed = $3, failed = $4, skipped = $5, remaining = $6,
              error = $7, detail = $8::jsonb
        where id = $1`,
      [
        id,
        result.status,
        result.processed,
        result.failed,
        result.skipped,
        result.remaining,
        result.error,
        JSON.stringify(result.detail ?? null),
      ],
    );
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }
}
