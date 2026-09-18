-- Chessito · La otra mitad de F4-01: en qué jugada se tuerce cada línea del repertorio
--
-- Es la pregunta 1 del proyecto — "contra qué aperturas pierde, con qué color, y **en qué jugada
-- cae la evaluación**" — y la app nunca la había podido contestar, porque `divergence_ply` solo
-- existe en partidas analizadas y la rápida estaba sin analizar. Al terminar el backfill
-- (2.588 de 2.588) el dato quedó disponible y con muestra de sobra.
--
-- Medido al escribir esto, y es el hallazgo: con el Ponziani aguanta hasta la **jugada 21**; con
-- 1…e5 contra 1.e4 se le tuerce en la **15**. Seis jugadas de diferencia entre su repertorio con
-- blancas y el de negras.
--
-- `divergence_ply` (0001) es el primer ply donde su evaluación cae bajo -100 cp, ya girada a su
-- perspectiva. Solo lo tienen las partidas donde eso llegó a pasar: en el resto nunca perdió el
-- hilo, y por eso `n_diverged` es el denominador honesto y no `n`.

create or replace view v_repertorio_divergencia as
select
  coalesce(p.repertorio_id, 'fuera')                                      as repertorio_id,
  r.nombre,
  p.my_color,
  count(*)::int                                                           as n,
  count(g.divergence_ply)::int                                            as n_diverged,
  percentile_cont(0.5) within group (order by g.divergence_ply)           as mediana_ply,
  avg(g.divergence_ply)::real                                             as promedio_ply
from v_repertorio_partida p
join games g on g.id = p.game_id
left join repertoire r on r.id = p.repertorio_id
where g.analysis_state = 'done'
group by 1, 2, 3;

alter view v_repertorio_divergencia set (security_invoker = on);

comment on view v_repertorio_divergencia is
  'En que jugada se tuerce cada linea del repertorio. `mediana_ply` es sobre las partidas que SI '
  'divergieron (`n_diverged`), no sobre todas: en las otras nunca perdio el hilo y meterlas como '
  'ceros o ignorarlas cambiaria el numero en direcciones opuestas.';

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.v_repertorio_divergencia from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.v_repertorio_divergencia from authenticated';
  end if;
end $$;
