-- Chessito · Revisión integral, Fase 2 · F2-04: /reloj separa clases de tiempo
--
-- Las cuatro vistas de 0006 no tienen dimensión `time_class`: promedian una partida de 1 minuto
-- con una de 10. Con 1.850 de bala, 5.660 de blitz y 2.588 de rápida en el histórico, lo que
-- /reloj describe hoy es la bala, no la rápida — que es el único formato del plan de
-- entrenamiento. El sesgo no es una sospecha: `v_errors_by_move_time` (0001) ya traía la
-- dimensión y por eso /errores sí podía filtrar; /reloj no.
--
-- 0006 queda intacta: nunca se edita una migración aplicada, y las vistas viejas siguen
-- sirviendo a quien quiera el agregado de todas las clases juntas.
--
-- Toda vista nueva va con security_invoker = on y sin grants para anon/authenticated (regla de
-- 0005). Las cuatro exponen su `n`, que es lo que deja aplicar el umbral de 20.

-- Dónde piensa, jugada a jugada. Es la curva principal de /reloj.
create or replace view v_tiempo_por_jugada as
select
  g.time_class,
  m.ply,
  count(*)                                                         as n,
  avg(m.move_time_ms)::int                                         as avg_move_time_ms,
  percentile_cont(0.5) within group (order by m.move_time_ms)::int as median_move_time_ms
from moves m
join games g on g.id = m.game_id
where m.is_mine and m.move_time_ms is not null and g.rules = 'chess'
group by 1, 2;

alter view v_tiempo_por_jugada set (security_invoker = on);

comment on view v_tiempo_por_jugada is
  'Tiempo por ply, separado por clase de tiempo. Reemplaza a v_move_time_by_ply (0006), que '
  'promediaba bala con rapida y por lo tanto describia la bala.';

-- Un número por fase y clase: qué tan seguido juega bajo 3 segundos. Con wilson_lower porque es
-- un porcentaje, y la regla del proyecto es no mostrar el porcentaje pelado.
create or replace view v_tiempo_por_fase as
select
  g.time_class,
  m.phase,
  count(*)                                                                as n,
  wilson_lower(
    (count(*) filter (where m.move_time_ms < 3000))::real, count(*)::int
  )                                                                        as pct_under_3s_lower,
  (count(*) filter (where m.move_time_ms < 3000))::real
    / nullif(count(*), 0)                                                  as pct_under_3s_bruto,
  avg(m.move_time_ms)::int                                                as avg_move_time_ms
from moves m
join games g on g.id = m.game_id
where m.is_mine and m.move_time_ms is not null and g.rules = 'chess'
group by 1, 2;

alter view v_tiempo_por_fase set (security_invoker = on);

comment on view v_tiempo_por_fase is
  'Tiempo y proporcion de jugadas bajo 3s por fase y clase. Expone el bruto ademas de la cota '
  'de Wilson porque la pagina necesita los dos: Wilson para comparar, bruto para describir.';

-- Histograma de tiempos. Mismos cortes que v_errors_by_move_time (0001), para que las dos
-- páginas hablen de los mismos tramos.
create or replace view v_distribucion_de_tiempo as
select
  g.time_class,
  m.phase,
  case
    when m.move_time_ms <  3000 then '<3s'
    when m.move_time_ms < 10000 then '3-10s'
    when m.move_time_ms < 30000 then '10-30s'
    else '>30s'
  end            as time_bucket,
  count(*)       as n
from moves m
join games g on g.id = m.game_id
where m.is_mine and m.move_time_ms is not null and g.rules = 'chess'
group by 1, 2, 3;

alter view v_distribucion_de_tiempo set (security_invoker = on);

comment on view v_distribucion_de_tiempo is
  'Distribucion de tiempo por jugada, por fase y clase. Los cortes son los mismos de '
  'v_errors_by_move_time para poder cruzar las dos paginas.';

-- En qué momento se le acaba el tiempo. `g.termination` guarda el resultado de Gabriel (regla
-- del proyecto), así que no hace falta distinguir de quién era el turno.
create or replace view v_momento_del_timeout as
select
  ultima.time_class,
  ultima.phase,
  count(*)              as n_games,
  avg(ultima.ply)::int  as avg_ply
from (
  select
    g.time_class,
    m.phase,
    m.ply,
    row_number() over (partition by g.id order by m.ply desc) as rn
  from games g
  join moves m on m.game_id = g.id and m.is_mine
  where g.rules = 'chess' and g.result = 'loss' and g.termination = 'timeout'
) ultima
where ultima.rn = 1
group by 1, 2;

alter view v_momento_del_timeout set (security_invoker = on);

comment on view v_momento_del_timeout is
  'Fase de la ultima jugada propia en las derrotas por tiempo, por clase. Perder por tiempo en '
  'bala y en rapida son dos problemas distintos y la vista de 0006 los sumaba.';

-- Candados para los roles de Supabase, igual que 0006, 0008..0011. `anon` y `authenticated` los
-- crea Supabase y no existen en el Postgres comun de los tests: un revoke pelado abortaria la
-- migracion entera.
do $$
declare
  v text;
begin
  foreach v in array array[
    'v_tiempo_por_jugada', 'v_tiempo_por_fase',
    'v_distribucion_de_tiempo', 'v_momento_del_timeout'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', v);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', v);
    end if;
  end loop;
end $$;
