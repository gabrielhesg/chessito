import 'server-only';
import type { AdminClient } from '@/lib/supabase/admin';
import type { GameRow } from '@/lib/chess/game';
import type { MoveRow } from '@/lib/chess/moves';
import type { Json } from '@/lib/database.types';
import type {
  GameForMoves,
  IngestStore,
  JobRunInput,
  JobRunResult,
  OpeningIndexEntry,
  OpeningInsert,
} from './store';

/** Implementacion sobre PostgREST con la service role key. Es la que corre en Vercel. */
export class SupabaseIngestStore implements IngestStore {
  constructor(private readonly client: AdminClient) {}

  async loadOpeningIndex(): Promise<Map<string, OpeningIndexEntry>> {
    const index = new Map<string, OpeningIndexEntry>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('openings')
        .select('id, epd, ply_count')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`No se pudo leer openings: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) index.set(row.epd, { id: row.id, plyCount: row.ply_count });
      if (data.length < pageSize) break;
    }
    return index;
  }

  async upsertGames(rows: GameRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client
      .from('games')
      .upsert(rows, { onConflict: 'chesscom_uuid', ignoreDuplicates: false });
    if (error) throw new Error(`No se pudieron guardar las partidas: ${error.message}`);
  }

  async insertOpenings(rows: OpeningInsert[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client
      .from('openings')
      .upsert(rows, { onConflict: 'epd', ignoreDuplicates: true });
    if (error) throw new Error(`No se pudieron guardar las aperturas: ${error.message}`);
  }

  async countOpenings(): Promise<number> {
    const { count, error } = await this.client
      .from('openings')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error(`No se pudo contar openings: ${error.message}`);
    return count ?? 0;
  }

  async recomputeSessionFeatures(): Promise<void> {
    const { error } = await this.client.rpc('recompute_session_features');
    if (error) throw new Error(`Fallo recompute_session_features: ${error.message}`);
  }

  async findExistingUuids(uuids: string[]): Promise<Set<string>> {
    const found = new Set<string>();
    const CHUNK = 500;
    for (let from = 0; from < uuids.length; from += CHUNK) {
      const { data, error } = await this.client
        .from('games')
        .select('chesscom_uuid')
        .in('chesscom_uuid', uuids.slice(from, from + CHUNK));
      if (error) throw new Error(`No se pudo reconciliar: ${error.message}`);
      for (const row of data ?? []) found.add(row.chesscom_uuid);
    }
    return found;
  }

  async countPendingAnalysis(): Promise<number> {
    const { count, error } = await this.client
      .from('games')
      .select('id', { count: 'exact', head: true })
      .eq('analysis_state', 'pending');
    if (error) throw new Error(`No se pudo contar pendientes: ${error.message}`);
    return count ?? 0;
  }

  async startJobRun(input: JobRunInput): Promise<number> {
    const { data, error } = await this.client
      .from('job_runs')
      .insert({ kind: input.kind, status: 'running', environment: input.environment, trigger: input.trigger })
      .select('id')
      .single();
    if (error || !data) throw new Error(`No se pudo abrir job_runs: ${error?.message ?? 'sin fila'}`);
    return data.id;
  }

  async finishJobRun(id: number, result: JobRunResult): Promise<void> {
    const { data: started, error: readError } = await this.client
      .from('job_runs')
      .select('started_at')
      .eq('id', id)
      .single();
    if (readError || !started) throw new Error(`No se pudo cerrar job_runs ${id}: ${readError?.message}`);

    const durationMs = Date.now() - new Date(started.started_at).getTime();
    const { error } = await this.client
      .from('job_runs')
      .update({
        status: result.status,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        processed: result.processed,
        failed: result.failed,
        skipped: result.skipped,
        remaining: result.remaining,
        error: result.error,
        // `detail` es jsonb: se serializa y se vuelve a parsear para que lo que se escriba sea
        // JSON valido de verdad, y no una asercion de tipos que apaga la verificacion.
        detail: JSON.parse(JSON.stringify(result.detail ?? null)) as Json,
      })
      .eq('id', id);
    if (error) throw new Error(`No se pudo cerrar job_runs ${id}: ${error.message}`);
  }

  async loadGamesForMoves(): Promise<GameForMoves[]> {
    const rows: GameForMoves[] = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.client
        .from('v_games_pending_moves')
        .select('id, pgn, my_color, base_seconds, increment_secs, opening_ply_count')
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`No se pudo leer las partidas pendientes de moves: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const row of data) {
        // Las columnas de v_games_pending_moves vienen de games, que las declara NOT NULL;
        // el generador de tipos las marca opcionales solo porque salen de un LEFT JOIN. Si
        // alguna vez llegan null de verdad, es un dato corrupto y hay que caerse, no seguir
        // con un valor inventado.
        if (row.id === null || row.pgn === null || row.base_seconds === null || row.increment_secs === null) {
          throw new Error(`Fila incompleta en v_games_pending_moves: ${JSON.stringify(row)}`);
        }
        rows.push({
          id: row.id,
          pgn: row.pgn,
          myColor: row.my_color as 'white' | 'black',
          baseSeconds: row.base_seconds,
          incrementSecs: row.increment_secs,
          openingPlyCount: row.opening_ply_count ?? 0,
        });
      }
      if (data.length < pageSize) break;
    }
    return rows;
  }

  async insertMoves(gameId: number, rows: MoveRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.client.from('moves').insert(rows.map((row) => ({ game_id: gameId, ...row })));
    if (error) throw new Error(`No se pudieron guardar las jugadas de la partida ${gameId}: ${error.message}`);
  }

  async markMovesFailed(gameId: number): Promise<void> {
    const { error } = await this.client.from('games').update({ analysis_state: 'failed' }).eq('id', gameId);
    if (error) throw new Error(`No se pudo marcar failed la partida ${gameId}: ${error.message}`);
  }

  async markMovesEmpty(gameId: number): Promise<void> {
    const { error } = await this.client.from('games').update({ analysis_state: 'skipped' }).eq('id', gameId);
    if (error) throw new Error(`No se pudo marcar skipped la partida ${gameId}: ${error.message}`);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
