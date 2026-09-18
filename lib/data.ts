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
export type OpeningPerformance = Views['v_opening_performance']['Row'];
export type ByHour = Views['v_by_hour']['Row'];
export type BySessionIndex = Views['v_by_session_index']['Row'];
export type AfterResult = Views['v_after_result']['Row'];
export type DataQuality = Views['v_data_quality']['Row'];
export type HealthJobs = Views['v_health_jobs']['Row'];
export type HealthSummary = Views['v_health_summary']['Row'];
export type GamesByMonth = Views['v_games_by_month']['Row'];
export type AnalysisCoverage = Views['v_analysis_coverage']['Row'];
export type CoberturaAnalisis = Views['v_cobertura_analisis']['Row'];
export type TiempoPorJugada = Views['v_tiempo_por_jugada']['Row'];
export type TiempoPorFase = Views['v_tiempo_por_fase']['Row'];
export type DistribucionDeTiempo = Views['v_distribucion_de_tiempo']['Row'];
export type MomentoDelTimeout = Views['v_momento_del_timeout']['Row'];
export type ErrorsByPhase = Views['v_errors_by_phase']['Row'];
export type ErrorsByMoveTime = Views['v_errors_by_move_time']['Row'];
export type JobRun = Database['public']['Tables']['job_runs']['Row'];
export type Game = Database['public']['Tables']['games']['Row'];
export type Puzzle = Database['public']['Tables']['puzzles']['Row'];
export type DerrotaSinRevisar = Views['v_derrotas_sin_revisar']['Row'];
export type MotivoDeDerrota = Views['v_motivos_de_derrota']['Row'];
export type GameReview = Database['public']['Tables']['game_reviews']['Row'];
export type RepertorioRendimiento = Views['v_repertorio_rendimiento']['Row'];
export type RepertorioDivergencia = Views['v_repertorio_divergencia']['Row'];
export type RespuestaDelRival = Views['v_respuestas_del_rival']['Row'];
export type NorthStar = Views['v_north_star']['Row'];
export type NorthStarMensual = Views['v_north_star_mensual']['Row'];
export type ConversionDeVentaja = Views['v_conversion_de_ventaja']['Row'];
export type VentajaPorPartida = Views['v_ventaja_por_partida']['Row'];
export type RegalosMensual = Views['v_regalos_mensual']['Row'];
export type ReviewMotivo = Database['public']['Enums']['review_motivo'];

function fail(view: string, message: string): never {
  throw new Error(`No se pudo leer ${view}: ${message}`);
}

/**
 * Actividad mensual por clase de tiempo.
 *
 * El limite es de FILAS, y cada mes aporta una fila por clase jugada: con `limit(24)` la
 * portada veia ~8 meses, justo la ventana en que Gabriel dejo la rapida, y de ahi salia el
 * "rating de blitz" como numero grande. Ahora se piden 24 meses de verdad (hasta 4 clases por
 * mes) y quien presenta decide que clase mostrar.
 */
export async function monthlyActivity(): Promise<MonthlyActivity[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_monthly_activity_wilson')
    .select('*')
    .order('month_local', { ascending: false })
    .limit(24 * 4);
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

/**
 * Cobertura del analisis por clase, con TODAS las columnas de estado.
 *
 * A diferencia de `v_analysis_coverage`, sus columnas suman su propio `n_games`: la vieja no
 * contaba las `skipped` en ningun lado y por eso 1.406 partidas de rapida desaparecian del
 * denominador sin dejar rastro. Ver la migracion 0011.
 */
export async function coberturaAnalisis(): Promise<CoberturaAnalisis[]> {
  const { data, error } = await supabaseAdmin().from('v_cobertura_analisis').select('*');
  if (error) fail('v_cobertura_analisis', error.message);
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

/**
 * Las cuatro lecturas de /reloj. Traen TODAS las clases de tiempo y la pagina filtra la suya,
 * igual que ya hacia /errores con `v_errors_by_phase`: asi la tabla de comparacion entre clases
 * no cuesta una consulta extra.
 *
 * Reemplazan a las de `v_move_time_*` (0006), que no tenian dimension de clase y por lo tanto
 * promediaban una partida de bala con una de 10 minutos. Las vistas viejas siguen existiendo en
 * la base porque no se edita una migracion aplicada, pero ya no las lee nadie.
 */

/** Tiempo gastado por numero de jugada. Solo hasta el ply 60: mas alla la muestra es minuscula. */
export async function tiempoPorJugada(): Promise<TiempoPorJugada[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_tiempo_por_jugada')
    .select('*')
    .lte('ply', 60)
    .order('ply');
  if (error) fail('v_tiempo_por_jugada', error.message);
  return data ?? [];
}

export async function tiempoPorFase(): Promise<TiempoPorFase[]> {
  const { data, error } = await supabaseAdmin().from('v_tiempo_por_fase').select('*').order('phase');
  if (error) fail('v_tiempo_por_fase', error.message);
  return data ?? [];
}

export async function distribucionDeTiempo(): Promise<DistribucionDeTiempo[]> {
  const { data, error } = await supabaseAdmin().from('v_distribucion_de_tiempo').select('*');
  if (error) fail('v_distribucion_de_tiempo', error.message);
  return data ?? [];
}

export async function momentoDelTimeout(): Promise<MomentoDelTimeout[]> {
  const { data, error } = await supabaseAdmin().from('v_momento_del_timeout').select('*').order('phase');
  if (error) fail('v_momento_del_timeout', error.message);
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
export async function nextDuePuzzle(
  tema?: string | null,
  temasDeLaSemana: readonly string[] = [],
): Promise<Puzzle | null> {
  async function cola(filtro?: { uno?: string; varios?: readonly string[] }): Promise<Puzzle | null> {
    let query = supabaseAdmin()
      .from('v_cola_de_ejercicios')
      .select('*')
      .lte('due_at', new Date().toISOString())
      // La sesion dirigida: primero los errores de una derrota de rapida de los ultimos 7 dias,
      // que es cuando la partida todavia se recuerda y el ejercicio ensena el doble. `prioridad`
      // la calcula la vista; aca solo se respeta el orden.
      .order('prioridad', { ascending: true })
      .order('due_at', { ascending: true })
      .limit(1);
    if (filtro?.uno) query = query.eq('theme', filtro.uno);
    if (filtro?.varios && filtro.varios.length > 0) query = query.in('theme', [...filtro.varios]);
    const { data, error } = await query.maybeSingle();
    if (error) fail('v_cola_de_ejercicios', error.message);
    return data as Puzzle | null;
  }

  // Un tema elegido a mano manda sobre todo lo demas: lo pidio el alumno.
  if (tema) return cola({ uno: tema });

  // El tema de la semana es el tercer nivel de prioridad, y es BLANDO: si no hay ninguno vencido
  // de ese patron, se sirve la cola normal en vez de decir "no hay ejercicios". Cinco de los ocho
  // temas del ciclo no tienen ejercicios posibles (finales, estructuras), asi que un filtro duro
  // dejaria al entrenador vacio cinco semanas de cada ocho.
  if (temasDeLaSemana.length > 0) {
    const deLaSemana = await cola({ varios: temasDeLaSemana });
    if (deLaSemana) return deLaSemana;
  }
  return cola();
}

/**
 * El proximo ejercicio de UNA partida, para el boton "entrenar los N errores de esta partida".
 *
 * Ignora `due_at` por la misma razon que `puzzleAt`: si el alumno acaba de revisar esa derrota y
 * pide entrenar sus errores, servirselos es el punto; que la repeticion espaciada no los tuviera
 * programados es irrelevante. El orden por `due_at` hace que la tanda rote sola: al resolver uno,
 * SM-2 empuja su fecha al futuro y el siguiente pasa a ser el primero.
 */
export async function nextPuzzleDeLaPartida(gameId: number): Promise<Puzzle | null> {
  const { data, error } = await supabaseAdmin()
    .from('puzzles')
    .select('*')
    .eq('game_id', gameId)
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) fail('puzzles', error.message);
  return data;
}

/** Cuantos ejercicios tiene una partida. Es el N del boton de /partida. */
export async function ejerciciosDeLaPartida(gameId: number): Promise<number> {
  const { data, error } = await supabaseAdmin()
    .from('v_ejercicios_por_partida')
    .select('n')
    .eq('game_id', gameId)
    .maybeSingle();
  if (error) fail('v_ejercicios_por_partida', error.message);
  return data?.n ?? 0;
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
/**
 * En que conceptos te equivocas mas, contando INTENTOS fallados.
 *
 * Lee `v_conceptos_fallados_rapida` (migracion 0010), que cuenta SOLO las partidas de rapida: en
 * bala y en blitz un error dice mas del reloj que de lo que entiendes, y mezclarlos vuelve el
 * panel inutil justo para lo que existe. Los EJERCICIOS se siguen sirviendo desde todas las
 * partidas: una posicion perdida en blitz entrena igual.
 *
 * Cuenta el historial completo, asi que un error que ya corregiste sigue apareciendo. La copia de
 * la pantalla lo dice ("los que mas has repetido"), para que el numero no se lea como un
 * diagnostico de hoy.
 */
export async function conceptosFallados(): Promise<
  Array<{ concepto: string; intentos: number; ejercicios: number; esResiduo: boolean }>
> {
  const { data, error } = await supabaseAdmin()
    .from('v_conceptos_panel')
    .select('concepto, intentos, ejercicios, es_residuo')
    .order('intentos', { ascending: false })
    .limit(8);
  if (error) fail('v_conceptos_panel', error.message);
  return (data ?? []).flatMap((f) =>
    f.concepto
      ? [
          {
            concepto: f.concepto,
            intentos: f.intentos ?? 0,
            ejercicios: f.ejercicios ?? 0,
            esResiduo: f.es_residuo ?? false,
          },
        ]
      : [],
  );
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
  /**
   * Derrotas de rapida que todavia no se revisaron. Implica `time_class = 'rapid'` y
   * `result = 'loss'`: revisar bala no esta en el plan, y "una victoria sin revisar" no es un
   * concepto que exista.
   */
  sinRevisar?: boolean;
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

  if (filters.sinRevisar) {
    // Se excluyen las YA revisadas, no se incluyen las pendientes: `game_reviews` tiene una fila
    // por revision hecha (decenas), mientras que las derrotas pendientes son cientos. Excluir la
    // lista corta es lo que mantiene la consulta chica. Si algun dia hay miles de revisiones,
    // esto pasa a ser un `not.in` largo y hay que moverlo a la vista.
    const revisados = await idsRevisados();
    query = query.eq('time_class', 'rapid').eq('result', 'loss');
    if (revisados.size > 0) query = query.not('id', 'in', `(${[...revisados].join(',')})`);
  }

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


/**
 * La derrota de rapida mas reciente. Es la entrada del ciclo de aprendizaje: hoy llegar a ella
 * cuesta cinco taps y un scroll horizontal que la interfaz no senaliza, y por eso el ritual
 * "toda derrota se analiza" depende de que Gabriel se acuerde.
 *
 * Todavia no sabe si ya la reviso: eso es `game_reviews`, de la Fase 2 de la revision.
 */
export async function ultimaDerrotaDeRapida(): Promise<Game | null> {
  const { data, error } = await supabaseAdmin()
    .from('games')
    .select('*')
    .eq('rules', 'chess')
    .eq('time_class', 'rapid')
    .eq('result', 'loss')
    .order('end_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail('games', error.message);
  return data;
}

/**
 * La cola de derrotas de rapida sin revisar, de la mas reciente hacia atras.
 *
 * `limite` es 3 en la portada y NO es un detalle de presentacion: mostrar las 40 pendientes es
 * mostrar una deuda, y una deuda no se empieza. Es la misma leccion que los 397 ejercicios
 * vencidos. `n_total` viene en cada fila (ventana sobre la misma consulta) para poder decir
 * "y 37 mas" sin traerse las 37.
 */
export async function derrotasSinRevisar(limite = 3): Promise<DerrotaSinRevisar[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_derrotas_sin_revisar')
    .select('*')
    .limit(limite);
  if (error) fail('v_derrotas_sin_revisar', error.message);
  return data ?? [];
}

/** La revision de una partida, si ya se hizo. */
export async function revisionDePartida(gameId: number): Promise<GameReview | null> {
  const { data, error } = await supabaseAdmin()
    .from('game_reviews')
    .select('*')
    .eq('game_id', gameId)
    .maybeSingle();
  if (error) fail('game_reviews', error.message);
  return data;
}

/**
 * Los ids de las partidas ya revisadas. Lo usa el registro para dos cosas: filtrar por "sin
 * revisar" y distinguir la fila de una derrota que sigue pendiente.
 */
export async function idsRevisados(): Promise<Set<number>> {
  const { data, error } = await supabaseAdmin().from('game_reviews').select('game_id');
  if (error) fail('game_reviews', error.message);
  return new Set((data ?? []).map((r) => r.game_id));
}

/**
 * Rendimiento por entrada del repertorio DECLARADO, no por la apertura que ocurrio.
 *
 * La fila `fuera` no es un residuo que se esconde: es el tamano del problema. Medido en
 * produccion, con blancas son 795 partidas contra 507 que si llegan al Ponziani.
 */
export async function repertorioRendimiento(): Promise<RepertorioRendimiento[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_repertorio_rendimiento')
    .select('*')
    .order('n', { ascending: false });
  if (error) fail('v_repertorio_rendimiento', error.message);
  return data ?? [];
}

/**
 * En que jugada se tuerce cada linea del repertorio: la pregunta 1 del proyecto, que hasta el
 * backfill de rapida no se podia contestar.
 *
 * `mediana_ply` va sobre `n_diverged`, no sobre `n`: en las partidas que nunca cayeron bajo
 * -100 cp no hay un "donde se torcio" que promediar.
 */
export async function repertorioDivergencia(): Promise<RepertorioDivergencia[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_repertorio_divergencia')
    .select('*')
    .order('n', { ascending: false });
  if (error) fail('v_repertorio_divergencia', error.message);
  return data ?? [];
}

/** Que le juegan cuando NO llega a su repertorio. Es la mitad del diagnostico que no pide motor. */
export async function respuestasDelRival(minimo = 20): Promise<RespuestaDelRival[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_respuestas_del_rival')
    .select('*')
    .gte('n', minimo)
    .order('n', { ascending: false });
  if (error) fail('v_respuestas_del_rival', error.message);
  return data ?? [];
}

/**
 * La North Star: piezas colgadas por partida de rapida, sobre las ultimas 20 analizadas.
 *
 * Menor es mejor. Viene con `n` y con su metrica de apoyo (`pvr_por_jugada`) en la misma fila,
 * porque la regla del proyecto es que ninguna cifra agregada se muestre sin su `n` — y una North
 * Star sin su cobertura al lado es exactamente la clase de numero que este proyecto existe para
 * no producir.
 */
export async function northStar(): Promise<NorthStar | null> {
  const { data, error } = await supabaseAdmin().from('v_north_star').select('*').maybeSingle();
  if (error) fail('v_north_star', error.message);
  return data;
}

/** La serie mensual de la North Star, que es lo que llena "Estas mejorando" en la portada. */
export async function northStarMensual(): Promise<NorthStarMensual[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_north_star_mensual')
    .select('*')
    .order('month_local');
  if (error) fail('v_north_star_mensual', error.message);
  return data ?? [];
}

/** Conversion de ventaja: de las ultimas 30 partidas con +200 a favor, cuantas termino ganando. */
export async function conversionDeVentaja(): Promise<ConversionDeVentaja | null> {
  const { data, error } = await supabaseAdmin()
    .from('v_conversion_de_ventaja')
    .select('*')
    .maybeSingle();
  if (error) fail('v_conversion_de_ventaja', error.message);
  return data;
}

/**
 * Las partidas donde tuvo la ventaja y no la convirtio, de la mas reciente hacia atras.
 *
 * Es el mejor material de revision que tiene: ahi el error no fue tactico, y es donde se aprende
 * plan. `ply_perdida` engancha con el entrenador.
 */
export async function ventajasNoConvertidas(limite = 8): Promise<VentajaPorPartida[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_ventaja_por_partida')
    .select('*')
    .gte('ventaja_maxima', 200)
    .neq('result', 'win')
    .order('end_time', { ascending: false })
    .limit(limite);
  if (error) fail('v_ventaja_por_partida', error.message);
  return data ?? [];
}

/** Los regalos del rival por mes, y cuantos se aprovecharon. */
export async function regalosMensual(): Promise<RegalosMensual[]> {
  const { data, error } = await supabaseAdmin()
    .from('v_regalos_mensual')
    .select('*')
    .order('month_local');
  if (error) fail('v_regalos_mensual', error.message);
  return data ?? [];
}

/** Lo que el alumno dice que le pasa, agrupado, con cuanto se aleja del ply que senala el motor. */
export async function motivosDeDerrota(): Promise<MotivoDeDerrota[]> {
  const { data, error } = await supabaseAdmin().from('v_motivos_de_derrota').select('*');
  if (error) fail('v_motivos_de_derrota', error.message);
  return data ?? [];
}

/**
 * Desglose por control de tiempo de las partidas de rapida de un mes local (`YYYY-MM`).
 *
 * **No es un detector de desviaciones, y esa correccion la dio Gabriel.** La version original de
 * este comentario trataba el 10+0 como una desviacion de un plan que declaraba 15+10 (19 partidas
 * contra 2.569). Preguntado directamente, respondio que juega los dos formatos a proposito. Asi
 * que el desglose se muestra como lo que es —informacion— y ninguna pantalla lo presenta como una
 * brecha: medir una desviacion que el jugador no considera desviacion es fabricar un problema.
 *
 * Sigue siendo util: dos formatos distintos tienen relojes distintos, y /reloj y los blunders por
 * tiempo se leen distinto en uno y en otro.
 */
export async function formatosDeRapida(month: string): Promise<Array<{ timeControl: string; n: number }>> {
  const { data, error } = await supabaseAdmin()
    .from('v_rapida_por_formato')
    .select('time_control, n')
    .eq('month_local', month)
    .order('n', { ascending: false });
  if (error) fail('v_rapida_por_formato', error.message);
  return (data ?? []).flatMap((f) => (f.time_control ? [{ timeControl: f.time_control, n: f.n ?? 0 }] : []));
}

/**
 * Cuantas partidas de rapida jugo HOY (dia local de Santiago).
 *
 * La tarea del dia tiene que poder completarse hoy: el contador viejo de la portada era
 * `rapidas >= 30 && vencidos === 0 ? 2 : 0`, o sea solo podia valer 0 o 2 y dependia de la meta
 * del MES y de la deuda completa de repeticion espaciada.
 */
export async function rapidasDeHoy(): Promise<number> {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const { data, error } = await supabaseAdmin()
    .from('v_games_by_day')
    .select('n_rapid')
    .eq('day_local', hoy)
    .maybeSingle();
  if (error) fail('v_games_by_day', error.message);
  return data?.n_rapid ?? 0;
}

/**
 * Cuanto toma un ejercicio, en milisegundos: la mediana real de los intentos que ya ocurrieron.
 * La portada estimaba "1 minuto por ejercicio" con una constante, que ademas multiplicaba por
 * los 397 vencidos y daba "~397 min" como plan del dia.
 */
export async function medianaPorEjercicioMs(): Promise<number | null> {
  const { data, error } = await supabaseAdmin()
    .from('puzzle_attempts')
    .select('ms_taken')
    .not('ms_taken', 'is', null)
    .order('attempted_at', { ascending: false })
    .limit(100);
  if (error) fail('puzzle_attempts', error.message);
  const valores = (data ?? []).flatMap((f) => (f.ms_taken === null ? [] : [f.ms_taken])).sort((a, b) => a - b);
  if (valores.length === 0) return null;
  const medio = Math.floor(valores.length / 2);
  return valores.length % 2 === 0 ? ((valores[medio - 1] ?? 0) + (valores[medio] ?? 0)) / 2 : (valores[medio] ?? 0);
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

/**
 * Ejercicios vencidos agrupados por patron tactico.
 *
 * La agregacion vive en `v_ejercicios_vencidos_por_tema` (migracion 0011) y no en TypeScript,
 * que es la regla del proyecto. Antes se traian hasta 1.000 filas y se agrupaban en memoria:
 * con 397 vencidos funcionaba, y con 1.200 habria dado un desglose incompleto sin avisar.
 */
export async function dueByTheme(): Promise<Array<{ theme: string | null; n: number }>> {
  const { data, error } = await supabaseAdmin()
    .from('v_ejercicios_vencidos_por_tema')
    .select('theme, n')
    .order('n', { ascending: false });
  if (error) fail('v_ejercicios_vencidos_por_tema', error.message);
  return (data ?? []).map((f) => ({ theme: f.theme, n: f.n ?? 0 }));
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
