-- Chessito · Fase 2: las vistas de /reloj y el transporte de moves:extract
--
-- No hay motor todavia: todo lo de aca sale de moves.move_time_ms, moves.phase y moves.is_book,
-- que pueblo "pnpm moves:extract" desde el PGN. Nada de esto depende de moves.classification
-- (eso es Fase 3).
--
-- v_games_pending_moves existe solo por una limitacion de PostgREST: SupabaseIngestStore (el
-- transporte que usa la app en Vercel) no puede expresar el "left join + not exists" que
-- decide que partida le falta moves sin ir fila por fila. PgIngestStore (los scripts batch,
-- que es el camino real para esto) hace la misma consulta directo en SQL. Las dos leen
-- exactamente lo mismo.
--
-- Toda vista nueva va con security_invoker = on y sin grants para anon/authenticated: la regla
-- que dejo la migracion 0005, para que ninguna vista nueva reabra el hueco que esa migracion
-- cerro.

create or replace view v_games_pending_moves as
select
  g.id,
  g.pgn,
  g.my_color,
  g.base_seconds,
  g.increment_secs,
  o.ply_count as opening_ply_count
from games g
left join openings o on o.id = g.opening_id
where g.analysis_state not in ('skipped', 'failed')
  and not exists (select 1 from moves m where m.game_id = g.id);

-- Tiempo gastado por numero de jugada. Es el primer grafico de /reloj: donde piensa Gabriel.
create or replace view v_move_time_by_ply as
select
  m.ply,
  count(*)                                                                as n,
  avg(m.move_time_ms)::int                                                as avg_move_time_ms,
  percentile_cont(0.5) within group (order by m.move_time_ms)::int        as median_move_time_ms
from moves m
join games g on g.id = m.game_id
where m.is_mine and m.move_time_ms is not null and g.rules = 'chess'
group by m.ply
order by m.ply;

-- Un solo numero por fase: que tan seguido juega bajo 3 segundos, con wilson_lower porque es
-- un porcentaje (regla del proyecto: nunca el porcentaje pelado).
create or replace view v_move_time_by_phase as
select
  m.phase,
  count(*)                                                                          as n,
  wilson_lower(
    (count(*) filter (where m.move_time_ms < 3000))::real, count(*)::int
  )                                                                                  as pct_under_3s_lower,
  avg(m.move_time_ms)::int                                                          as avg_move_time_ms
from moves m
join games g on g.id = m.game_id
where m.is_mine and m.move_time_ms is not null and g.rules = 'chess'
group by m.phase
order by m.phase;

-- Distribucion de tiempos por jugada, para el histograma. Mismos cortes que
-- v_errors_by_move_time (0001), sin depender de moves.classification.
create or replace view v_move_time_distribution as
select
  m.phase,
  case
    when m.move_time_ms <  3000 then '<3s'
    when m.move_time_ms < 10000 then '3-10s'
    when m.move_time_ms < 30000 then '10-30s'
    else '>30s'
  end                                                                      as time_bucket,
  count(*)                                                                 as n
from moves m
join games g on g.id = m.game_id
where m.is_mine and m.move_time_ms is not null and g.rules = 'chess'
group by 1, 2;

-- En que momento de la partida se le acaba el tiempo: la fase de la ultima jugada mia en las
-- derrotas por termination = 'timeout'. `g.termination` es MI resultado (regla del proyecto),
-- asi que no hace falta distinguir de quien era el turno.
create or replace view v_timeout_moment as
select
  last_move.phase,
  count(*)              as n_games,
  avg(last_move.ply)::int as avg_ply
from (
  select
    m.phase,
    m.ply,
    row_number() over (partition by g.id order by m.ply desc) as rn
  from games g
  join moves m on m.game_id = g.id and m.is_mine
  where g.rules = 'chess' and g.result = 'loss' and g.termination = 'timeout'
) last_move
where last_move.rn = 1
group by last_move.phase
order by last_move.phase;

do $$
declare
  vista text;
begin
  foreach vista in array array[
    'v_games_pending_moves',
    'v_move_time_by_ply',
    'v_move_time_by_phase',
    'v_move_time_distribution',
    'v_timeout_moment'
  ]
  loop
    execute format('alter view public.%I set (security_invoker = on)', vista);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute format(
      'revoke all on %s from anon',
      (select string_agg(format('public.%I', v), ', ') from unnest(array[
        'v_games_pending_moves','v_move_time_by_ply','v_move_time_by_phase',
        'v_move_time_distribution','v_timeout_moment'
      ]) as v)
    );
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute format(
      'revoke all on %s from authenticated',
      (select string_agg(format('public.%I', v), ', ') from unnest(array[
        'v_games_pending_moves','v_move_time_by_ply','v_move_time_by_phase',
        'v_move_time_distribution','v_timeout_moment'
      ]) as v)
    );
  end if;
end;
$$;
