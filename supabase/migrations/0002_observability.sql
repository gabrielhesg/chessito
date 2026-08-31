-- Chessito · observabilidad y control de calidad de datos
--
-- Responde tres preguntas que el usuario tiene que poder contestar sin abrir la consola:
--   1. ¿Se cargaron las partidas nuevas, y cuándo fue la última vez?
--   2. ¿Los datos están sanos, o hay algo silenciosamente roto?
--   3. ¿Falta alguna partida respecto de lo que chess.com dice que tengo?
--
-- Para revertir: drop de las vistas y de la tabla job_runs, y drop de los dos tipos.

-- ============================================================
-- registro de corridas de procesos batch
-- ============================================================
create type job_kind   as enum ('ingest','extract_moves','analyze','puzzles','backup');
create type job_status as enum ('running','success','failed');

create table job_runs (
  id           bigserial   primary key,
  kind         job_kind    not null,
  status       job_status  not null default 'running',
  environment  text        not null,            -- 'dev' | 'prod'
  trigger      text        not null,            -- 'cron' | 'manual' | 'workflow_dispatch'
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  duration_ms  int,

  processed    int         not null default 0,
  failed       int         not null default 0,
  skipped      int         not null default 0,
  remaining    int,                             -- cuántas quedan pendientes al terminar

  engine_id    text,                            -- solo en corridas de análisis
  error        text,                            -- mensaje de la excepción si status = 'failed'
  detail       jsonb                            -- lo que el proceso quiera dejar registrado
);

create index job_runs_kind_idx on job_runs (kind, started_at desc);
create index job_runs_status_idx on job_runs (status, started_at desc)
  where status <> 'success';

alter table job_runs enable row level security;

-- Toda corrida de cualquier script batch abre una fila con status 'running' y la cierra
-- con 'success' o 'failed'. Una fila que queda en 'running' es un proceso que murió sin
-- avisar, y eso también es información.

-- ============================================================
-- ¿está corriendo la ingesta?
-- ============================================================
create or replace view v_health_jobs as
select
  k.kind,
  (select max(started_at) from job_runs j
    where j.kind = k.kind and j.status = 'success')                as last_success_at,
  round(extract(epoch from (
    now() - (select max(started_at) from job_runs j
             where j.kind = k.kind and j.status = 'success')
  )) / 3600.0, 1)                                                  as hours_since_success,
  (select count(*) from job_runs j
    where j.kind = k.kind and j.status = 'failed'
      and j.started_at > now() - interval '7 days')                as failures_7d,
  (select count(*) from job_runs j
    where j.kind = k.kind and j.status = 'running'
      and j.started_at < now() - interval '6 hours')               as stuck_runs
from unnest(enum_range(null::job_kind)) as k(kind);

-- La app muestra un aviso visible si hours_since_success de 'ingest' pasa de 48.
-- Datos viejos mostrados como si fueran frescos son peor que no mostrar nada.

-- ============================================================
-- reconciliación: ¿tengo todas las partidas?
-- ============================================================
-- Devuelve el conteo local por mes. El proceso de ingesta compara esto contra el conteo
-- que reporta la API de chess.com para el mismo mes y registra la diferencia en
-- job_runs.detail. Si hay diferencia, la ingesta está perdiendo partidas.
create or replace view v_games_by_month as
select
  to_char(end_time at time zone 'America/Santiago', 'YYYY-MM') as month_local,
  count(*)                                                    as n_local,
  count(*) filter (where rules = 'chess')                      as n_chess,
  count(*) filter (where analysis_state = 'skipped')           as n_skipped,
  min(end_time)                                                as first_game,
  max(end_time)                                                as last_game
from games
group by 1
order by 1 desc;

-- ============================================================
-- invariantes: chequeos que tienen que dar cero
-- ============================================================
-- Cada fila es un chequeo. `ok` en false significa que hay algo roto.
-- La página /salud los muestra todos y la CI puede fallar si alguno da false.
create or replace view v_data_quality as

  select 'tiempos_de_jugada_negativos'::text as check_name,
         count(*)                             as offenders,
         count(*) = 0                         as ok,
         'move_time_ms nunca puede ser negativo tras el clampeo'::text as descripcion
  from moves where move_time_ms < 0

union all
  select 'partidas_analizadas_sin_jugadas',
         count(*), count(*) = 0,
         'una partida en estado done tiene que tener filas en moves'
  from games g
  where g.analysis_state = 'done'
    and not exists (select 1 from moves m where m.game_id = g.id)

union all
  select 'conteo_de_jugadas_no_calza',
         count(*), count(*) = 0,
         'las filas en moves tienen que coincidir con games.ply_count'
  from (
    select g.id from games g
    join moves m on m.game_id = g.id
    where g.analysis_state = 'done'
    group by g.id, g.ply_count
    having count(m.ply) <> g.ply_count
  ) t

union all
  select 'clasificacion_sin_metrica',
         count(*), count(*) = 0,
         'no puede haber classification sin win_pct_loss que la justifique'
  from moves where classification is not null and win_pct_loss is null

union all
  select 'perdidas_negativas',
         count(*), count(*) = 0,
         'win_pct_loss y cp_loss son siempre mayores o iguales a cero. Si no, el signo está mal'
  from moves where win_pct_loss < 0 or cp_loss < 0

union all
  select 'errores_solo_de_un_color',
         count(*), count(*) = 0,
         'si un color no tiene NINGUN error grave registrado, el paso 2 del signo está mal'
  from (
    select g.my_color
    from games g
    where g.analysis_state = 'done'
    group by g.my_color
    having count(*) >= 20
       and sum(coalesce(g.blunders, 0)) = 0
  ) t

union all
  select 'partidas_reclamadas_huerfanas',
         count(*), count(*) = 0,
         'partidas en claimed hace más de 30 minutos: el analizador murió a medio camino'
  from games
  where analysis_state = 'claimed' and claimed_at < now() - interval '30 minutes'

union all
  select 'mezcla_de_motores',
         count(distinct engine_id), count(distinct engine_id) <= 1,
         'dos versiones de motor en la misma tabla hacen incomparables las evaluaciones'
  from games where analysis_state = 'done' and engine_id is not null

union all
  select 'aperturas_sin_resolver',
         count(*),
         count(*) * 100.0 / greatest((select count(*) from games where rules = 'chess'), 1) < 5,
         'menos del 5% de las partidas puede quedar sin apertura resuelta por EPD'
  from games where rules = 'chess' and opening_id is null

union all
  select 'evaluaciones_fuera_de_rango',
         count(*), count(*) = 0,
         'eval_cp fuera de mas menos 15000 indica un error de parseo del motor'
  from moves where abs(eval_cp) > 15000;

-- ============================================================
-- resumen de una línea para la portada
-- ============================================================
create or replace view v_health_summary as
select
  (select count(*) from v_data_quality where not ok)                    as checks_failing,
  (select count(*) from v_data_quality)                                 as checks_total,
  (select hours_since_success from v_health_jobs where kind = 'ingest') as ingest_hours_old,
  (select count(*) from games where rules = 'chess')                    as n_games,
  (select count(*) from games where analysis_state = 'done')            as n_analyzed,
  (select count(*) from games where analysis_state = 'pending')         as n_pending;
