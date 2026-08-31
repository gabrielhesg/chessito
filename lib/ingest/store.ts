import type { GameRow } from '@/lib/chess/game';

/**
 * Todo lo que la ingesta necesita de la base de datos, y nada mas.
 *
 * Existe para que `runIngest` sea una sola funcion, sin dos copias de la logica, y para
 * poder ejercitarla de punta a punta contra un Postgres de verdad en los tests.
 * Hay dos implementaciones y ambas hablan con el MISMO esquema y la MISMA funcion SQL
 * (`recompute_session_features`, definida en la migracion 0003):
 *
 *   - `SupabaseIngestStore`: la que usa la app en Vercel (service role, sobre PostgREST).
 *   - `PgIngestStore`: conexion directa por `SUPABASE_DB_URL`, para los scripts batch y
 *     GitHub Actions, donde hay miles de filas y la conexion directa es mucho mas barata.
 */
export type OpeningIndexEntry = { id: string; plyCount: number };

export type OpeningInsert = {
  id: string;
  eco: string;
  name: string;
  pgn: string;
  epd: string;
  ply_count: number;
};

export type JobRunInput = {
  kind: 'ingest' | 'extract_moves' | 'analyze' | 'puzzles' | 'backup';
  environment: string;
  trigger: string;
};

export type JobRunResult = {
  status: 'success' | 'failed';
  processed: number;
  failed: number;
  skipped: number;
  remaining: number | null;
  error: string | null;
  detail: unknown;
};

export interface IngestStore {
  /** epd -> apertura, para resolver por EPD sin ir a la base por cada partida. */
  loadOpeningIndex(): Promise<Map<string, OpeningIndexEntry>>;
  /** Upsert idempotente por `chesscom_uuid`. */
  upsertGames(rows: GameRow[]): Promise<void>;
  /** `on conflict (epd) do nothing`, ordenando por ply_count ascendente. */
  insertOpenings(rows: OpeningInsert[]): Promise<void>;
  countOpenings(): Promise<number>;
  /** Llama a la funcion SQL `recompute_session_features()`. */
  recomputeSessionFeatures(): Promise<void>;
  /** De una lista de uuids de chess.com, cuales estan efectivamente guardados. */
  findExistingUuids(uuids: string[]): Promise<Set<string>>;
  countPendingAnalysis(): Promise<number>;
  startJobRun(input: JobRunInput): Promise<number>;
  finishJobRun(id: number, result: JobRunResult): Promise<void>;
  close(): Promise<void>;
}
