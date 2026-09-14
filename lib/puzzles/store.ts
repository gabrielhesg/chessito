/**
 * Acceso a datos de `build-puzzles`. Un solo transporte, mismo criterio que
 * `lib/analysis/store.ts`: este script solo corre en GitHub Actions/local, nunca desde Vercel,
 * asi que no hay un segundo camino que justifique la interfaz dual de `IngestStore`.
 */
import { Client } from 'pg';
import type { GameColor } from '@/lib/chess/game';
import type { Theme } from '@/lib/chess/theme';
import type { JobRunInput, JobRunResult } from '@/lib/ingest/store';

export type BlunderCandidate = {
  gameId: number;
  myColor: GameColor;
  ply: number;
  playedUci: string;
  cpLoss: number;
  winPctLoss: number;
};

export type PuzzleRow = {
  gameId: number;
  ply: number;
  fen: string;
  playedUci: string;
  bestUci: string;
  cpLoss: number;
  winPctLoss: number;
  isUnique: boolean;
  theme: Theme | null;
};

export class PuzzleStore {
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
   * Blunders reales de Gabriel (classification=3, is_mine, fuera de libro, partida no decidida)
   * que todavia no tienen ejercicio. El `not exists` es la primera red de idempotencia; el
   * `on conflict` de `insertPuzzle` es la segunda.
   */
  async claimBlunderCandidates(limit: number): Promise<BlunderCandidate[]> {
    const client = await this.connect();
    const res = await client.query<{
      game_id: number;
      my_color: GameColor;
      ply: number;
      played_uci: string;
      cp_loss: number;
      win_pct_loss: number;
    }>(
      `select g.id as game_id, g.my_color, m.ply, m.uci as played_uci, m.cp_loss, m.win_pct_loss
         from moves m
         join games g on g.id = m.game_id
        where m.classification = 3
          and m.is_mine
          and not m.is_book
          and not m.is_decided
          and not exists (select 1 from puzzles p where p.game_id = m.game_id and p.ply = m.ply)
        order by g.end_time desc
        limit $1`,
      [limit],
    );
    return res.rows.map((row) => ({
      gameId: row.game_id,
      myColor: row.my_color,
      ply: row.ply,
      playedUci: row.played_uci,
      cpLoss: row.cp_loss,
      winPctLoss: row.win_pct_loss,
    }));
  }

  /** Los `uci` de todas las jugadas ANTES de `ply`, en orden, para reconstruir el FEN previo al blunder. */
  async loadUciPrefix(gameId: number, ply: number): Promise<string[]> {
    const client = await this.connect();
    const res = await client.query<{ uci: string }>(
      'select uci from moves where game_id = $1 and ply < $2 order by ply',
      [gameId, ply],
    );
    return res.rows.map((row) => row.uci);
  }

  async insertPuzzle(row: PuzzleRow): Promise<void> {
    const client = await this.connect();
    await client.query(
      `insert into puzzles (game_id, ply, fen, played_uci, best_uci, cp_loss, win_pct_loss, is_unique, theme)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (game_id, ply) do nothing`,
      [row.gameId, row.ply, row.fen, row.playedUci, row.bestUci, row.cpLoss, row.winPctLoss, row.isUnique, row.theme],
    );
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
