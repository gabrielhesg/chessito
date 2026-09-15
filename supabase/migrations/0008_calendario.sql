-- Fase 7: la portada nueva muestra un calendario del mes con cuantas partidas se jugaron cada
-- dia. Es la unica vista que faltaba para alimentarlo con datos reales.
--
-- Agrupa por dia LOCAL de Santiago, igual que `v_games_by_month` agrupa por mes local: el dia
-- de una partida que termina a las 21:40 en Chile no es el mismo que en UTC, y el calendario
-- tiene que calzar con lo que Gabriel recuerda haber jugado.
--
-- `security_invoker = on` y sin grants para anon/authenticated, que es la regla del proyecto
-- desde la migracion 0005.

create or replace view v_games_by_day as
select
  (end_time at time zone 'America/Santiago')::date as day_local,
  count(*)::int                                     as n_games,
  count(*) filter (where time_class = 'rapid')::int as n_rapid
from games
where rules = 'chess'
group by 1;

alter view v_games_by_day set (security_invoker = on);

-- Los roles `anon` y `authenticated` los crea Supabase, no PostgreSQL: en un Postgres comun (el
-- de los tests de integracion) no existen y un `revoke` pelado aborta la migracion entera. Mismo
-- guardado que usan 0005 y 0006.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.v_games_by_day from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.v_games_by_day from authenticated;
  end if;
end $$;

comment on view v_games_by_day is
  'Partidas por dia local de Santiago. Alimenta el calendario de la portada.';
