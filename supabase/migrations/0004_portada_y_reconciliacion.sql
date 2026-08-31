-- Chessito · vistas que faltaban para la portada y para /salud
--
-- Dos reglas del proyecto que la Fase 1 estaba incumpliendo en TypeScript y que corresponden
-- a SQL:
--   1. "Los rendimientos usan wilson_lower, no el porcentaje pelado". `v_monthly_activity`
--      (0001) expone `score_pct` pelado y no expone `n` por mes completo, asi que la portada
--      no podia ni ordenar ni atenuar bien.
--   2. "Las agregaciones entre filas viven en vistas SQL. TypeScript no agrega, solo presenta".
--      La portada sumaba partidas del mes con reduce() y /aperturas calculaba el porcentaje de
--      "Sin resolver" a mano.
--
-- Para revertir: drop de las tres vistas.

-- ============================================================
-- portada: el mes en curso, ya agregado
-- ============================================================
create or replace view v_monthly_summary as
select
  to_char(end_time at time zone 'America/Santiago', 'YYYY-MM')      as month_local,
  count(*)                                                          as n_games,
  count(*) filter (where time_class = 'rapid')                      as n_rapid,
  count(*) filter (where time_class = 'blitz')                      as n_blitz,
  count(*) filter (where time_class = 'bullet')                     as n_bullet,
  avg(score)                                                        as score_pct,
  wilson_lower(sum(score)::real, count(*)::int)                     as score_pct_lower,
  (array_agg(my_rating order by end_time desc))[1]                  as rating_at_month_end
from games
where rules = 'chess'
group by 1;

-- ============================================================
-- portada: actividad por mes y control de tiempo, con n y Wilson
-- ============================================================
-- Reemplaza el uso de `v_monthly_activity` en la UI. La vista original se mantiene intacta
-- (nunca se edita una migracion aplicada) pero no expone `n` ni la cota de Wilson.
create or replace view v_monthly_activity_wilson as
select
  to_char(end_time at time zone 'America/Santiago', 'YYYY-MM')  as month_local,
  time_class,
  count(*)                                                      as n,
  avg(score)                                                    as score_pct,
  wilson_lower(sum(score)::real, count(*)::int)                 as score_pct_lower,
  (array_agg(my_rating order by end_time desc))[1]              as rating_at_month_end
from games
where rules = 'chess'
group by 1, 2;

-- ============================================================
-- /aperturas: cuanto queda sin resolver por EPD
-- ============================================================
-- Es el mismo numerador del chequeo `aperturas_sin_resolver` de v_data_quality, pero
-- presentable: si este porcentaje crece, hay un bug en el cargador de aperturas.
create or replace view v_opening_resolution as
select
  count(*)                                                                        as n_games,
  count(*) filter (where opening_id is null)                                      as n_unresolved,
  (count(*) filter (where opening_id is null))::real
    / greatest(count(*), 1)                                                       as pct_unresolved
from games
where rules = 'chess';
