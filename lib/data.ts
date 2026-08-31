import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type { Database } from '@/lib/database.types';

/**
 * Lecturas de la app. Todo del lado servidor, con los tipos generados, una consulta por
 * bloque de datos y cero agregacion en TypeScript: eso vive en las vistas SQL.
 */
type Views = Database['public']['Views'];
export type MonthlyActivity = Views['v_monthly_activity_wilson']['Row'];
export type MonthlySummary = Views['v_monthly_summary']['Row'];
export type OpeningResolution = Views['v_opening_resolution']['Row'];
export type OpeningPerformance = Views['v_opening_performance']['Row'];
export type ByHour = Views['v_by_hour']['Row'];
export type BySessionIndex = Views['v_by_session_index']['Row'];
export type AfterResult = Views['v_after_result']['Row'];
export type DataQuality = Views['v_data_quality']['Row'];
export type HealthJobs = Views['v_health_jobs']['Row'];
export type HealthSummary = Views['v_health_summary']['Row'];
export type GamesByMonth = Views['v_games_by_month']['Row'];
export type AnalysisCoverage = Views['v_analysis_coverage']['Row'];
export type JobRun = Database['public']['Tables']['job_runs']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];

function fail(view: string, message: string): never {
  throw new Error(`No se pudo leer ${view}: ${message}`);
}

export async function monthlyActivity(): Promise<MonthlyActivity[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_monthly_activity_wilson')
    .select('*')
    .order('month_local', { ascending: false })
    .limit(24);
  if (error) fail('v_monthly_activity_wilson', error.message);
  return data ?? [];
}

/** El mes en curso ya agregado en SQL: TypeScript no suma filas, solo presenta. */
export async function monthlySummary(month: string): Promise<MonthlySummary | null> {
  const { data, error } = await supabaseAdmin()
    .from('v_monthly_summary')
    .select('*')
    .eq('month_local', month)
    .maybeSingle();
  if (error) fail('v_monthly_summary', error.message);
  return data;
}

export async function openingResolution(): Promise<OpeningResolution | null> {
  const { data, error } = await supabaseAdmin().from('v_opening_resolution').select('*').maybeSingle();
  if (error) fail('v_opening_resolution', error.message);
  return data;
}

export async function openingPerformance(): Promise<OpeningPerformance[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_opening_performance')
    .select('*')
    .order('n', { ascending: false })
    .limit(200);
  if (error) fail('v_opening_performance', error.message);
  return data ?? [];
}

export async function byHour(): Promise<ByHour[]> {
  const { data, error } = await supabaseAdmin().from('v_by_hour').select('*').order('hour_local');
  if (error) fail('v_by_hour', error.message);
  return data ?? [];
}

export async function bySessionIndex(): Promise<BySessionIndex[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_by_session_index')
    .select('*')
    .order('game_index_capped');
  if (error) fail('v_by_session_index', error.message);
  return data ?? [];
}

export async function afterResult(): Promise<AfterResult[]> {
  const { data, error } = await supabaseAdmin().from('v_after_result').select('*');
  if (error) fail('v_after_result', error.message);
  return data ?? [];
}

export async function dataQuality(): Promise<DataQuality[]> {
  const { data, error } = await supabaseAdmin().from('v_data_quality').select('*');
  if (error) fail('v_data_quality', error.message);
  return data ?? [];
}

export async function healthJobs(): Promise<HealthJobs[]> {
  const { data, error } = await supabaseAdmin().from('v_health_jobs').select('*');
  if (error) fail('v_health_jobs', error.message);
  return data ?? [];
}

export async function healthSummary(): Promise<HealthSummary | null> {
  const { data, error } = await supabaseAdmin().from('v_health_summary').select('*').maybeSingle();
  if (error) fail('v_health_summary', error.message);
  return data;
}

export async function gamesByMonth(): Promise<GamesByMonth[]> {
  const { data, error } = await supabaseAdmin().from('v_games_by_month').select('*').limit(36);
  if (error) fail('v_games_by_month', error.message);
  return data ?? [];
}

export async function analysisCoverage(): Promise<AnalysisCoverage[]> {
  const { data, error } = await supabaseAdmin().from('v_analysis_coverage').select('*');
  if (error) fail('v_analysis_coverage', error.message);
  return data ?? [];
}

export async function lastJobRuns(limit = 15): Promise<JobRun[]> {
  const { data, error } = await supabaseAdmin()
    .from('job_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) fail('job_runs', error.message);
  return data ?? [];
}

export type GameFilters = {
  timeClass?: string;
  color?: 'white' | 'black';
  result?: 'win' | 'loss' | 'draw';
  limit?: number;
};

export type GameListRow = Pick<
  Game,
  | 'id'
  | 'end_time'
  | 'url'
  | 'time_class'
  | 'time_control'
  | 'my_color'
  | 'result'
  | 'termination'
  | 'my_rating'
  | 'opp_rating'
  | 'opp_username'
  | 'ply_count'
  | 'opening_id'
  | 'game_in_session'
>;

export async function listGames(filters: GameFilters): Promise<{ rows: GameListRow[]; total: number }> {
  let query = supabaseAdmin()
    .from('games')
    .select(
      'id, end_time, url, time_class, time_control, my_color, result, termination, my_rating, opp_rating, opp_username, ply_count, opening_id, game_in_session',
      { count: 'exact' },
    )
    .eq('rules', 'chess')
    .order('end_time', { ascending: false })
    .limit(filters.limit ?? 100);

  if (filters.timeClass) query = query.eq('time_class', filters.timeClass);
  if (filters.color) query = query.eq('my_color', filters.color);
  if (filters.result) query = query.eq('result', filters.result);

  const { data, error, count } = await query;
  if (error) fail('games', error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/** Nombres de apertura para las filas del registro, en una sola consulta (nada de N+1). */
export async function openingNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin().from('openings').select('id, name').in('id', unique);
  if (error) fail('openings', error.message);
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/**
 * La reconciliacion de la ultima ingesta, sacada de `job_runs.detail`.
 *
 * Es la capa 4 de docs/CONFIANZA.md: /salud tiene que mostrar si falta alguna partida respecto
 * de lo que chess.com dice que hay, y CUAL, no solo que la corrida salio mal.
 */
export type MesReconciliado = {
  month: string;
  remote: number;
  stored: number;
  missing: number;
  missing_uuids?: string[];
};

export type Reconciliacion = {
  ok: boolean;
  startedAt: string;
  meses: MesReconciliado[];
};

function esMesReconciliado(value: unknown): value is MesReconciliado {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['month'] === 'string' &&
    typeof row['remote'] === 'number' &&
    typeof row['stored'] === 'number' &&
    typeof row['missing'] === 'number'
  );
}

export async function ultimaReconciliacion(): Promise<Reconciliacion | null> {
  const { data, error } = await supabaseAdmin()
    .from('job_runs')
    .select('started_at, detail')
    .eq('kind', 'ingest')
    .not('detail', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('job_runs', error.message);
  if (!data?.detail || typeof data.detail !== 'object' || Array.isArray(data.detail)) return null;

  const detail = data.detail as Record<string, unknown>;
  const crudo = detail['reconciliation'];
  if (!Array.isArray(crudo)) return null;

  return {
    ok: detail['reconciliation_ok'] === true,
    startedAt: data.started_at,
    meses: crudo.filter(esMesReconciliado),
  };
}
