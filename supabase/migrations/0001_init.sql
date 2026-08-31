-- Chessito · esquema inicial
-- Postgres 15+ (Supabase). Verificado corriendo completo contra Postgres 16.
-- NO es idempotente: los create type y create table fallan si ya existen. Para
-- reaplicar desde cero, dropear la base o correr un drop schema public cascade.
--
-- Notas de diseño:
--  * `games.pgn` es la fuente de verdad local. Todo lo demás es derivable.
--  * `moves` es una fila por ply. No jsonb: todas las preguntas del proyecto son
--    agregaciones filtradas sobre jugadas, y en jsonb no serían indexables.
--  * Tamaño estimado con 5.000 partidas y 70 plies promedio: ~350k filas en `moves`,
--    ~35 MB de heap más ~13 MB de índices, más ~8 MB en `games`. Bajo 100 MB totales
--    contra los 500 MB del plan gratis.
--  * No se guarda FEN por ply a propósito: sumaría ~25 MB y ensancharía la fila,
--    frenando los escaneos que hacen las vistas. Se deriva reproduciendo el PGN.
--    Solo `puzzles` lo denormaliza, porque ahí se necesita caliente.

-- ============================================================
-- tipos
-- ============================================================
create type game_result    as enum ('win','loss','draw');
create type game_color     as enum ('white','black');
create type analysis_state as enum ('pending','claimed','done','failed','skipped');

-- ============================================================
-- referencia: aperturas
-- Cargar una vez desde los TSV de lichess-org/chess-openings (a.tsv .. e.tsv,
-- dominio público, ~3.500 filas). Ver docs/DATA-SOURCES.md.
-- ============================================================
create table openings (
  id         text     primary key,          -- slug determinista: eco || '_' || slug(name).
                                            -- ej 'C44_ponziani-opening'. La regla de slug debe
                                            -- quedar en una sola función del loader: si cambia,
                                            -- los FK de games.opening_id quedan colgando.
  eco        char(3)  not null,
  name       text     not null,
  pgn        text     not null,             -- la línea, en SAN
  epd        text     not null unique,      -- primeros 4 campos del fen() de chess.js
                                            -- (chess.js no expone epd()). Las transposiciones
                                            -- chocan: el loader usa on conflict (epd) do nothing
                                            -- y se queda con la línea más corta.
  ply_count  smallint not null
);
create index openings_epd_idx on openings (epd);
create index openings_eco_idx on openings (eco);

-- ============================================================
-- partidas
-- ============================================================
create table games (
  id              bigserial   primary key,
  chesscom_uuid   text        not null unique,   -- clave de idempotencia de la ingesta
  url             text        not null,
  end_time        timestamptz not null,
  time_class      text        not null,          -- rapid | blitz | bullet | daily
  time_control    text        not null,          -- '900+10', '600', o '1/86400' en correspondencia
  base_seconds    int         not null,          -- en correspondencia: segundos por jugada
  increment_secs  int         not null default 0,
  rules           text        not null default 'chess',

  my_color        game_color  not null,
  my_rating       int         not null,
  opp_rating      int         not null,
  opp_username    text        not null,
  result          game_result not null,
  score           real        not null,          -- 1 / 0.5 / 0, para promediar directo
  termination     text        not null,          -- del enum white.result/black.result del JSON,
                                                 -- NO del header Termination del PGN
  my_accuracy     real,                          -- accuracy de chess.com cuando viene

  -- apertura resuelta por nosotros vía EPD; la de chess.com se guarda solo para comparar
  opening_id      text        references openings(id),
  opening_eco_cc  char(3),
  opening_url_cc  text,

  ply_count       smallint    not null,
  pgn             text        not null,

  -- features de sesión, calculadas en la ingesta con window functions
  session_id      bigint,
  game_in_session smallint,
  prev_result     game_result,                   -- resultado de la partida anterior de la misma sesión

  -- rellenado por el analizador
  analysis_state  analysis_state not null default 'pending',
  claimed_at      timestamptz,
  analyzed_at     timestamptz,
  engine_id       text,                          -- derivado del 'id name' del motor + nodos +
                                                 -- hilos, ej 'sf16-800k-t7'. Versionar SIEMPRE.
  divergence_ply  smallint,                      -- primer ply donde MI evaluación cae bajo -100cp
                                                 -- y no vuelve sobre -50. Se calcula girando eval_cp
                                                 -- a mi perspectiva. NULL si nunca ocurre.
  acpl            int,                           -- centipeones perdidos en promedio, solo jugadas mías
  blunders        smallint,
  mistakes        smallint,
  inaccuracies    smallint,

  created_at      timestamptz not null default now(),

  constraint games_score_valid check (score in (0, 0.5, 1))
);

create index games_end_time_idx      on games (end_time desc);
create index games_class_time_idx    on games (time_class, end_time desc);
create index games_queue_idx         on games (analysis_state) where analysis_state in ('pending','claimed');
create index games_opening_idx       on games (opening_id, my_color);
create index games_session_idx       on games (session_id, game_in_session);

-- ============================================================
-- jugadas
-- ============================================================
create table moves (
  game_id        bigint   not null references games(id) on delete cascade,
  ply            smallint not null,               -- 1-based
  is_mine        boolean  not null,
  san            text     not null,
  uci            varchar(5) not null,
  phase          smallint not null,               -- 0 apertura / 1 medio juego / 2 final

  clock_ms       int,                             -- reloj restante DESPUÉS de la jugada, de %clk
  move_time_ms   int,                             -- prev_clk_mismo_jugador - clk + incremento.
                                                  -- En los plies 1 y 2 el reloj previo es
                                                  -- games.base_seconds. NULL solo si falta %clk.
                                                  -- Clampear a 0: %clk viene en decisegundos y
                                                  -- una jugada instantánea puede dar -100 ms.

  -- motor. Una evaluación por posición, no dos.
  eval_cp        int,                             -- SIEMPRE normalizado a perspectiva de BLANCAS.
                                                  -- OJO: el delta se vuelve a girar según quién
                                                  -- movió. Ver "Los DOS pasos de signo" en
                                                  -- docs/ANALYSIS-SPEC.md.
  mate_in        smallint,
  best_uci       varchar(5),
  cp_loss        int,                             -- desde la perspectiva del que movió, >= 0
  win_pct_loss   real,                            -- la métrica que clasifica
  classification smallint,                        -- 0 ok / 1 imprecisión / 2 error / 3 error grave.
                                                  -- La escribe el analizador, no hay trigger.
  is_book        boolean  not null default false, -- dentro de la línea de apertura reconocida
  is_decided     boolean  not null default false, -- win% antes de la jugada > 95 o < 5

  primary key (game_id, ply),

  constraint moves_phase_valid check (phase between 0 and 2),
  constraint moves_class_valid check (classification is null or classification between 0 and 3)
);

-- los dos índices que sostienen todas las vistas
create index moves_game_idx on moves (game_id) include (ply, is_mine, classification, move_time_ms);
create index moves_my_errors_idx on moves (classification, phase)
  where is_mine and classification >= 1 and not is_book and not is_decided;

-- ============================================================
-- entrenador
-- ============================================================
create table puzzles (
  id            bigserial   primary key,
  game_id       bigint      not null references games(id) on delete cascade,
  ply           smallint    not null,
  fen           text        not null,            -- posición ANTES de mi error. Denormalizada a propósito.
  played_uci    varchar(5)  not null,
  best_uci      varchar(5)  not null,
  cp_loss       int         not null,
  win_pct_loss  real        not null,
  is_unique     boolean     not null,            -- MultiPV=2 dice que la segunda opción es claramente peor
  theme         text,                            -- 'pieza_colgada','permite_horquilla','mate_pasillo'...

  -- repetición espaciada, SM-2 simplificado
  due_at        timestamptz not null default now(),
  interval_days int         not null default 0,
  ease          real        not null default 2.5,
  lapses        smallint    not null default 0,

  unique (game_id, ply)
);
create index puzzles_due_idx on puzzles (due_at) where is_unique;

create table puzzle_attempts (
  id           bigserial   primary key,
  puzzle_id    bigint      not null references puzzles(id) on delete cascade,
  correct      boolean     not null,
  ms_taken     int,
  attempted_at timestamptz not null default now()
);
create index puzzle_attempts_puzzle_idx on puzzle_attempts (puzzle_id, attempted_at desc);

-- ============================================================
-- RLS: activado sin políticas = deniega todo.
-- Todo el acceso es del lado servidor con la service role key, que salta RLS.
-- Esto evita escribir políticas (que es donde se va un fin de semana) sin dejar
-- la base abierta a la anon key.
-- ============================================================
alter table openings        enable row level security;
alter table games           enable row level security;
alter table moves           enable row level security;
alter table puzzles         enable row level security;
alter table puzzle_attempts enable row level security;

-- ============================================================
-- funciones auxiliares
-- ============================================================

-- Centipeones a probabilidad de victoria (fórmula de Lichess).
-- Se clampea a +-1000 antes de convertir: más allá el resultado ya no cambia
-- en la práctica y la exponencial satura.
create or replace function win_pct(cp int)
returns real
language sql
immutable
parallel safe
as $$
  select (50 + 50 * (2 / (1 + exp(-0.00368208 * greatest(-1000, least(1000, cp)))) - 1))::real;
$$;

-- Cota inferior de Wilson al 95%, una cola.
-- Para no mostrar "60% de rendimiento" cuando son 3 de 5.
-- Nota: se aplica sobre la suma de score (que incluye 0,5 por tablas), no sobre
-- un conteo binomial puro. Es una aproximación deliberada: sirve para ordenar y
-- para atenuar muestras chicas, no como intervalo estadístico publicable.
create or replace function wilson_lower(wins real, n int)
returns real
language sql
immutable
parallel safe
as $$
  select case when n = 0 then 0::real else
    (((wins + 1.9208) / n - 1.96 * sqrt((wins * (n - wins)) / n + 0.9604) / n)
      / (1 + 3.8416 / n))::real
  end;
$$;

-- ============================================================
-- vistas
-- Regla del proyecto: toda vista agregada expone `n`. La UI decide si mostrar.
-- ============================================================

-- Rendimiento por apertura y color.
create or replace view v_opening_performance as
select
  g.opening_id,
  coalesce(o.name, 'Sin resolver')                                as opening_name,
  o.eco,
  g.my_color,
  g.time_class,
  count(*)                                                        as n,
  avg(g.score)                                                    as score_pct,
  wilson_lower(sum(g.score)::real, count(*)::int)                 as score_pct_lower,
  count(g.divergence_ply)                                         as n_diverged,
  percentile_cont(0.5) within group (order by g.divergence_ply)   as median_divergence_ply,
  avg(g.acpl) filter (where g.analysis_state = 'done')            as acpl,
  count(*) filter (where g.analysis_state = 'done')               as n_analyzed
from games g
left join openings o on o.id = g.opening_id
where g.rules = 'chess'
group by 1,2,3,4,5;

-- Rendimiento por hora del día, en horario de Santiago.
-- El UTC crudo haría esta vista inútil: desplaza todo cuatro horas.
create or replace view v_by_hour as
select
  g.time_class,
  extract(hour from g.end_time at time zone 'America/Santiago')::int as hour_local,
  count(*)                                        as n,
  avg(g.score)                                    as score_pct,
  wilson_lower(sum(g.score)::real, count(*)::int) as score_pct_lower,
  avg(g.acpl) filter (where g.analysis_state = 'done') as acpl
from games g
where g.rules = 'chess'
group by 1,2;

-- Fatiga: rendimiento según cuántas partidas lleva en la sesión.
create or replace view v_by_session_index as
select
  g.time_class,
  least(g.game_in_session, 6)                     as game_index_capped,
  count(*)                                        as n,
  avg(g.score)                                    as score_pct,
  wilson_lower(sum(g.score)::real, count(*)::int) as score_pct_lower
from games g
where g.rules = 'chess' and g.game_in_session is not null
group by 1,2;

-- Tilt: qué pasa en la partida siguiente a una derrota, contra la línea base.
create or replace view v_after_result as
select
  g.time_class,
  g.prev_result,
  count(*)                                        as n,
  avg(g.score)                                    as score_pct,
  wilson_lower(sum(g.score)::real, count(*)::int) as score_pct_lower
from games g
where g.rules = 'chess' and g.prev_result is not null
group by 1,2;

-- Errores por fase de la partida.
create or replace view v_errors_by_phase as
select
  g.time_class,
  m.phase,
  count(*)                                          as n_moves,
  count(*) filter (where m.classification = 3)      as blunders,
  count(*) filter (where m.classification = 2)      as mistakes,
  count(*) filter (where m.classification = 1)      as inaccuracies,
  avg(m.cp_loss)                                    as avg_cp_loss
from moves m
join games g on g.id = m.game_id
where m.is_mine and not m.is_book and not m.is_decided
  and m.classification is not null and g.rules = 'chess'
group by 1,2;

-- La pregunta 4 en una sola vista: ¿los errores se concentran en las jugadas rápidas?
create or replace view v_errors_by_move_time as
select
  g.time_class,
  case
    when m.move_time_ms <  3000 then '<3s'
    when m.move_time_ms < 10000 then '3-10s'
    when m.move_time_ms < 30000 then '10-30s'
    else '>30s'
  end                                               as time_bucket,
  count(*)                                          as n_moves,
  count(*) filter (where m.classification >= 2)     as errors,
  (count(*) filter (where m.classification >= 2))::real / nullif(count(*), 0) as error_rate,
  avg(m.cp_loss)                                    as avg_cp_loss
from moves m
join games g on g.id = m.game_id
where m.is_mine and not m.is_book and not m.is_decided
  and m.move_time_ms is not null and m.classification is not null
  and g.rules = 'chess'
group by 1,2;

-- Cobertura del análisis, para mostrarla en cada página que use datos del motor.
create or replace view v_analysis_coverage as
select
  time_class,
  count(*)                                             as n_games,
  count(*) filter (where analysis_state = 'done')      as n_analyzed,
  count(*) filter (where analysis_state = 'pending')   as n_pending,
  count(*) filter (where analysis_state = 'failed')    as n_failed
from games
where rules = 'chess'
group by 1;

-- El número principal de la portada. No es la tasa de blunders a propósito.
create or replace view v_monthly_activity as
select
  date_trunc('month', end_time at time zone 'America/Santiago') as month_local,
  time_class,
  count(*)     as n_games,
  avg(score)   as score_pct,
  (array_agg(my_rating order by end_time desc))[1] as rating_at_month_end
from games
where rules = 'chess'
group by 1,2;
