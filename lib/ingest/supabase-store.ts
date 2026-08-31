import 'server-only';
import type { AdminClient } from '@/lib/supabase/admin';
import type { GameRow } from '@/lib/chess/game';
import type { IngestStore, JobRunInput, JobRunResult, OpeningIndexEntry, OpeningInsert } from './store';

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
        detail: result.detail as never,
      })
      .eq('id', id);
    if (error) throw new Error(`No se pudo cerrar job_runs ${id}: ${error.message}`);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
