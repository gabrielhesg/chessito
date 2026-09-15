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
export type MoveTimeByPly = Views['v_move_time_by_ply']['Row'];
export type MoveTimeByPhase = Views['v_move_time_by_phase']['Row'];
export type MoveTimeDistribution = Views['v_move_time_distribution']['Row'];
export type TimeoutMoment = Views['v_timeout_moment']['Row'];
export type ErrorsByPhase = Views['v_errors_by_phase']['Row'];
export type ErrorsByMoveTime = Views['v_errors_by_move_time']['Row'];
export type JobRun = Database['public']['Tables']['job_runs']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];
export type Puzzle = Database['public']['Tables']['puzzles']['Row'];

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

export type ErrorsDiagnostic = {
  conClasificacion: number;
  mias: number;
  miasNoLibro: number;
  miasNoLibroNoDecidida: number;
};

/**
 * Se usa solo cuando /errores tiene partidas analizadas pero las tablas salen vacias: en vez
 * de pedir que alguien corra una consulta a mano en Supabase, la app se responde sola con el
 * mismo desglose (docs/ANALYSIS-SPEC.md no dice cual de is_mine/is_book/is_decided se comio
 * las filas, esto lo aisla sin adivinar).
 */
export async function errorsDiagnostic(): Promise<ErrorsDiagnostic> {
  const client = supabaseAdmin();
  const base = () => client.from('moves').select('game_id', { count: 'exact', head: true }).not('classification', 'is', null);

  const [conClasificacion, mias, miasNoLibro, miasNoLibroNoDecidida] = await Promise.all([
    base(),
    base().eq('is_mine', true),
    base().eq('is_mine', true).eq('is_book', false),
    base().eq('is_mine', true).eq('is_book', false).eq('is_decided', false),
  ]);

  for (const res of [conClasificacion, mias, miasNoLibro, miasNoLibroNoDecidida]) {
    if (res.error) fail('moves (diagnostico de errores)', res.error.message);
  }

  return {
    conClasificacion: conClasificacion.count ?? 0,
    mias: mias.count ?? 0,
    miasNoLibro: miasNoLibro.count ?? 0,
    miasNoLibroNoDecidida: miasNoLibroNoDecidida.count ?? 0,
  };
}

/** Tiempo gastado por numero de jugada. Solo hasta el ply 60: mas alla la muestra es minuscula. */
export async function moveTimeByPly(): Promise<MoveTimeByPly[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_move_time_by_ply')
    .select('*')
    .lte('ply', 60)
    .order('ply');
  if (error) fail('v_move_time_by_ply', error.message);
  return data ?? [];
}

export async function moveTimeByPhase(): Promise<MoveTimeByPhase[]> {
  const { data, error } = await supabaseAdmin().from('v_move_time_by_phase').select('*').order('phase');
  if (error) fail('v_move_time_by_phase', error.message);
  return data ?? [];
}

export async function moveTimeDistribution(): Promise<MoveTimeDistribution[]> {
  const { data, error } = await supabaseAdmin().from('v_move_time_distribution').select('*');
  if (error) fail('v_move_time_distribution', error.message);
  return data ?? [];
}

export async function timeoutMoment(): Promise<TimeoutMoment[]> {
  const { data, error } = await supabaseAdmin().from('v_timeout_moment').select('*').order('phase');
  if (error) fail('v_timeout_moment', error.message);
  return data ?? [];
}

export async function errorsByPhase(): Promise<ErrorsByPhase[]> {
  const { data, error } = await supabaseAdmin().from('v_errors_by_phase').select('*');
  if (error) fail('v_errors_by_phase', error.message);
  return data ?? [];
}

export async function errorsByMoveTime(): Promise<ErrorsByMoveTime[]> {
  const { data, error } = await supabaseAdmin().from('v_errors_by_move_time').select('*');
  if (error) fail('v_errors_by_move_time', error.message);
  return data ?? [];
}

/** El proximo ejercicio a resolver: el que vence hace mas tiempo, entre los que pasaron el filtro MultiPV. */
/**
 * El proximo ejercicio vencido. Ya NO filtra por `is_unique`: esos ejercicios se construian
 * pagando tiempo de motor y despues no se servian nunca, porque el indice parcial los dejaba
 * afuera (ver la migracion 0007). Ahora se sirven igual y la UI avisa que hay mas de una jugada
 * buena, que es informacion util y no un motivo para esconder el ejercicio.
 */
export async function nextDuePuzzle(): Promise<Puzzle | null> {
  const { data, error } = await supabaseAdmin()
    .from('puzzles')
    .select('*')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) fail('puzzles', error.message);
  return data;
}

/**
 * El ejercicio de una posicion concreta, para el link "Entrenar esta posición" de /partida.
 * Ignora `due_at` a proposito: si Gabriel pide entrenar ESA posicion, se le sirve aunque la
 * repeticion espaciada todavia no la tuviera programada.
 */
export async function puzzleAt(gameId: number, ply: number): Promise<Puzzle | null> {
  const { data, error } = await supabaseAdmin()
    .from('puzzles')
    .select('*')
    .eq('game_id', gameId)
    .eq('ply', ply)
    .limit(1)
    .maybeSingle();
  if (error) fail('puzzles', error.message);
  return data;
}

/** Cuantos ejercicios estan vencidos ahora, para mostrar el tamaño de la cola en /entrenador. */
export async function dueCount(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from('puzzles')
    .select('id', { count: 'exact', head: true })
    .lte('due_at', new Date().toISOString());
  if (error) fail('puzzles', error.message);
  return count ?? 0;
}

/** Aciertos y fallos por patron tactico: en que tipo de error se tropieza mas seguido. */
export async function puzzleStatsByTheme(): Promise<
  Array<{ theme: string | null; intentos: number; aciertos: number }>
> {
  const { data, error } = await supabaseAdmin()
    .from('puzzle_attempts')
    .select('correct, attempt_no, puzzles(theme)')
    .eq('attempt_no', 1)
    .limit(2000);
  if (error) fail('puzzle_attempts', error.message);

  const porTema = new Map<string | null, { intentos: number; aciertos: number }>();
  for (const fila of data ?? []) {
    const relacion = (fila as { puzzles?: { theme: string | null } | { theme: string | null }[] }).puzzles;
    const tema = (Array.isArray(relacion) ? relacion[0]?.theme : relacion?.theme) ?? null;
    const acc = porTema.get(tema) ?? { intentos: 0, aciertos: 0 };
    acc.intentos += 1;
    if ((fila as { correct: boolean }).correct) acc.aciertos += 1;
    porTema.set(tema, acc);
  }
  return [...porTema.entries()]
    .map(([theme, v]) => ({ theme, ...v }))
    .sort((a, b) => b.intentos - a.intentos);
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
  /** Lista blanca fija: nunca se interpola un nombre de columna llegado del usuario. */
  sort?: 'end_time' | 'my_rating';
  dir?: 'asc' | 'desc';
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
  const sortColumn = filters.sort ?? 'end_time';
  const ascending = filters.dir === 'asc';

  let query = supabaseAdmin()
    .from('games')
    .select(
      'id, end_time, url, time_class, time_control, my_color, result, termination, my_rating, opp_rating, opp_username, ply_count, opening_id, game_in_session',
      { count: 'exact' },
    )
    .eq('rules', 'chess')
    .order(sortColumn, { ascending })
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

export type Move = Database['public']['Tables']['moves']['Row'];

export type GameDetail = { game: Game; moves: Move[] };

/**
 * Una partida con todas sus jugadas, para /partida/[id].
 *
 * NO devuelve un FEN por ply: el esquema no los guarda a proposito (nota en 0001_init.sql) y la
 * pagina los re-deriva en el cliente reproduciendo `games.pgn` con chess.js. Guardar 60 FEN por
 * partida x 10.000 partidas para algo que el navegador calcula en milisegundos no vale la pena.
 */
export async function gameDetail(id: number): Promise<GameDetail | null> {
  const client = supabaseAdmin();
  const [partida, jugadas] = await Promise.all([
    client.from('games').select('*').eq('id', id).maybeSingle(),
    client.from('moves').select('*').eq('game_id', id).order('ply'),
  ]);
  if (partida.error) fail('games', partida.error.message);
  if (jugadas.error) fail('moves', jugadas.error.message);
  if (!partida.data) return null;
  return { game: partida.data, moves: jugadas.data ?? [] };
}

export type GamesByDay = Views['v_games_by_day']['Row'];

/** Partidas por dia local del mes dado (`YYYY-MM`), para el calendario de la portada. */
export async function gamesByDay(month: string): Promise<GamesByDay[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_games_by_day')
    .select('*')
    .gte('day_local', `${month}-01`)
    .lte('day_local', `${month}-31`);
  if (error) fail('v_games_by_day', error.message);
  return data ?? [];
}

/** El rating mas alto alcanzado en un control de tiempo. No se guarda: se deriva de `games`. */
export async function ratingMaximo(timeClass: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin()
    .from('games')
    .select('my_rating')
    .eq('rules', 'chess')
    .eq('time_class', timeClass)
    .order('my_rating', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('games', error.message);
  return data?.my_rating ?? null;
}

/** Ejercicios vencidos agrupados por patron tactico, para "lo proximo que vence". */
export async function dueByTheme(): Promise<Array<{ theme: string | null; n: number }>> {
  const { data, error } = await supabaseAdmin()
    .from('puzzles')
    .select('theme')
    .lte('due_at', new Date().toISOString())
    .limit(1000);
  if (error) fail('puzzles', error.message);

  const porTema = new Map<string | null, number>();
  for (const fila of data ?? []) {
    porTema.set(fila.theme, (porTema.get(fila.theme) ?? 0) + 1);
  }
  return [...porTema.entries()].map(([theme, n]) => ({ theme, n })).sort((a, b) => b.n - a.n);
}

/**
 * Los ejercicios que se intentaron hoy, uno por ejercicio, para los puntos de progreso de la
 * sesion.
 *
 * "Acertado" significa lo MISMO que para SM-2: resuelto al primer intento y sin pista. Si contara
 * el ultimo intento, un ejercicio fallado dos veces y acertado al tercero saldria en verde y la
 * repeticion espaciada lo seguiria sirviendo — un punto verde para algo que la app considera
 * fallado se lee como un bug.
 *
 * "Hoy" es el dia local de Santiago, igual que todo lo demas que la app muestra por fecha.
 */
export async function sessionToday(): Promise<Array<{ correct: boolean }>> {
  const desde = new Date();
  // Se pide con holgura (30 h) y el dia exacto lo decide la comparacion de fecha local de abajo:
  // el offset de Santiago cambia con el horario de verano y no se quiere hardcodear.
  desde.setUTCHours(desde.getUTCHours() - 30);

  const { data, error } = await supabaseAdmin()
    .from('puzzle_attempts')
    .select('puzzle_id, correct, attempt_no, hint_used, attempted_at')
    .gte('attempted_at', desde.toISOString())
    .order('attempted_at', { ascending: true })
    .limit(1000);
  if (error) fail('puzzle_attempts', error.message);

  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });
  const hoyLocal = dia.format(new Date());

  // Un ejercicio se cuenta una vez. Se queda el PRIMER intento del dia, que es el que califica.
  const porPuzzle = new Map<number, boolean>();
  for (const fila of data ?? []) {
    if (dia.format(new Date(fila.attempted_at)) !== hoyLocal) continue;
    if (porPuzzle.has(fila.puzzle_id)) continue;
    porPuzzle.set(fila.puzzle_id, fila.correct && fila.attempt_no === 1 && !fila.hint_used);
  }
  return [...porPuzzle.values()].map((correct) => ({ correct }));
}
