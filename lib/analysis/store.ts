/**
 * Acceso a datos del analizador. A diferencia de `lib/ingest/store.ts`, esto NO lleva dos
 * transportes: el spec (docs/ANALYSIS-SPEC.md, "Credenciales del analizador") es explicito en
 * que el analizador habla directo a Postgres con `SUPABASE_DB_URL` porque necesita
 * `update ... returning` para reclamar lotes y una transaccion por partida, y en que no se
 * expone ninguna ruta HTTP de analisis. No hay un segundo camino que justifique la interfaz
 * dual: la regla del proyecto es no duplicar logica entre dos transportes, y aca solo hay uno.
 */
import { Client } from 'pg';
import type { GameColor } from '@/lib/chess/game';
import type { Classification } from './classify';
import type { JobRunInput, JobRunResult } from '@/lib/ingest/store';

export type ClaimedGame = { id: number; myColor: GameColor };

export type MoveForAnalysis = { ply: number; uci: string; isMine: boolean; isBook: boolean };

export type MoveAnalysisUpdate = {
  ply: number;
  evalCp: number;
  mateIn: number | null;
  /** null cuando la posicion resultante no tiene jugadas legales (jaque mate o ahogado). */
  bestUci: string | null;
  cpLoss: number;
  winPctLoss: number;
  classification: Classification;
  isDecided: boolean;
};

export type GameAnalysisSummary = {
  engineId: string;
  divergencePly: number | null;
  acpl: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
};

export class AnalysisStore {
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

  /**
   * Reclama un lote con `update ... returning` sobre una subconsulta `for update skip locked`:
   * `pending`, o `claimed` hace mas de 30 minutos (recuperacion de huerfanas). Rapida y blitz
   * primero, de la mas reciente hacia atras (docs/ANALYSIS-SPEC.md, maquina de estados).
   */
  async claimBatch(limit: number): Promise<ClaimedGame[]> {
    const client = await this.connect();
    const res = await client.query<{ id: number; my_color: GameColor }>(
      `update games set analysis_state = 'claimed', claimed_at = now()
        where id in (
          select id from games
           where rules = 'chess'
             and (
               analysis_state = 'pending'
               or (analysis_state = 'claimed' and claimed_at < now() - interval '30 minutes')
             )
           order by (time_class in ('rapid', 'blitz')) desc, end_time desc
           limit $1
           for update skip locked
        )
        returning id, my_color`,
      [limit],
    );
    return res.rows.map((row) => ({ id: row.id, myColor: row.my_color }));
  }

  /** Las filas de `moves` ya existen desde `moves:extract` (Fase 2): acá se leen, no se insertan. */
  async loadMovesForGame(gameId: number): Promise<MoveForAnalysis[]> {
    const client = await this.connect();
    const res = await client.query<{ ply: number; uci: string; is_mine: boolean; is_book: boolean }>(
      'select ply, uci, is_mine, is_book from moves where game_id = $1 order by ply',
      [gameId],
    );
    return res.rows.map((row) => ({ ply: row.ply, uci: row.uci, isMine: row.is_mine, isBook: row.is_book }));
  }

  /** Una transaccion: todas las filas de `moves` mas el `update` a `games` se confirman juntos. */
  async saveAnalysis(gameId: number, moveUpdates: MoveAnalysisUpdate[], summary: GameAnalysisSummary): Promise<void> {
    const client = await this.connect();
    await client.query('begin');
    try {
      for (const update of moveUpdates) {
        await client.query(
          `update moves
              set eval_cp = $3, mate_in = $4, best_uci = $5, cp_loss = $6,
                  win_pct_loss = $7, classification = $8, is_decided = $9
            where game_id = $1 and ply = $2`,
          [
            gameId,
            update.ply,
            update.evalCp,
            update.mateIn,
            update.bestUci,
            update.cpLoss,
            update.winPctLoss,
            update.classification,
            update.isDecided,
          ],
        );
      }
      await client.query(
        `update games
            set analysis_state = 'done', analyzed_at = now(), engine_id = $2,
                divergence_ply = $3, acpl = $4, blunders = $5, mistakes = $6, inaccuracies = $7
          where id = $1`,
        [
          gameId,
          summary.engineId,
          summary.divergencePly,
          summary.acpl,
          summary.blunders,
          summary.mistakes,
          summary.inaccuracies,
        ],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  async markFailed(gameId: number): Promise<void> {
    const client = await this.connect();
    await client.query("update games set analysis_state = 'failed' where id = $1", [gameId]);
  }

  /**
   * Verificacion de aceptacion de la Fase 3 (docs/ANALYSIS-SPEC.md): correlacion de Pearson
   * entre ACPL y `accuracies` de chess.com. Se espera claramente negativa (-0.6 o mas fuerte).
   * No son la misma unidad, por eso se compara con correlacion de rangos y no con una resta.
   */
  async correlationCheck(): Promise<{ pearson: number | null; n: number }> {
    const client = await this.connect();
    const res = await client.query<{ pearson: number | null; n: string }>(
      `select corr(acpl, my_accuracy) as pearson, count(*)::text as n
         from games
        where analysis_state = 'done' and my_accuracy is not null`,
    );
    const row = res.rows[0];
    return { pearson: row?.pearson ?? null, n: Number.parseInt(row?.n ?? '0', 10) };
  }

  async countPending(): Promise<number> {
    const client = await this.connect();
    const res = await client.query<{ n: string }>(
      "select count(*)::text as n from games where analysis_state = 'pending' and rules = 'chess'",
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
