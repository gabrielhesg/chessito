-- Chessito · F4-02, tercera función: el cierre de semana del ciclo
--
-- El ciclo de 8 semanas ya da una línea en la portada y ordena la cola de ejercicios. Falta lo
-- que lo vuelve útil: al cerrar la semana, **los errores de ese tipo esta semana contra el
-- promedio de las cuatro anteriores**. Sin eso el ciclo es un calendario, no un experimento.
--
-- La unidad es "blunders de ese patrón POR PARTIDA de rápida", no el conteo crudo: una semana de
-- 11 partidas y una de 4 no se comparan por total. `puzzles.theme` es lo que clasifica el patrón,
-- y cada `puzzle` viene de un blunder real suyo.
--
-- Medido al escribirlo: 11 partidas en la semana en curso, 4 en la anterior, 1 en la previa. Con
-- esos números **la comparación no concluye nada**, y la página tiene que decirlo — es el mismo
-- umbral de 20 que rige toda vista agregada del proyecto. El panel existe igual, porque ver el
-- número subir es lo que hace que la semana siguiente tenga sentido.

create or replace view v_errores_por_semana as
with semanas as (
  select
    date_trunc('week', g.end_time at time zone 'America/Santiago')::date as semana_inicio,
    count(*)::int                                                        as n_partidas
  from games g
  where g.rules = 'chess' and g.time_class = 'rapid' and g.analysis_state = 'done'
  group by 1
),
blunders as (
  select
    date_trunc('week', g.end_time at time zone 'America/Santiago')::date as semana_inicio,
    p.theme,
    count(*)::int                                                        as n_blunders
  from puzzles p
  join games g on g.id = p.game_id
  where g.rules = 'chess' and g.time_class = 'rapid' and g.analysis_state = 'done'
    and p.theme is not null
  group by 1, 2
)
select
  s.semana_inicio,
  to_char(s.semana_inicio, 'IYYY-"W"IW')                                 as semana,
  s.n_partidas,
  b.theme,
  coalesce(b.n_blunders, 0)                                              as n_blunders,
  (coalesce(b.n_blunders, 0)::real / nullif(s.n_partidas, 0))            as por_partida
from semanas s
left join blunders b on b.semana_inicio = s.semana_inicio;

alter view v_errores_por_semana set (security_invoker = on);

comment on view v_errores_por_semana is
  'Blunders por patron y por semana, normalizados POR PARTIDA de rapida. La normalizacion no es '
  'cosmetica: una semana de 11 partidas y una de 4 no se comparan por conteo crudo. Las semanas '
  'sin ningun blunder de un patron aparecen con `theme` null, no desaparecen.';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.v_errores_por_semana from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.v_errores_por_semana from authenticated';
  end if;
end $$;
