-- Fase 12: el analisis de errores cuenta solo las partidas de RAPIDA.
--
-- En bala y en blitz no hay tiempo para calcular: un error ahi dice mas del reloj que de lo que
-- el jugador entiende. Mezclarlos infla los conceptos equivocados y vuelve el panel inutil justo
-- para lo que existe — decidir que entrenar.
--
-- Ojo con lo que NO cambia: los EJERCICIOS se siguen construyendo desde todas las partidas. Una
-- posicion perdida en blitz sirve igual para entrenar; lo que no sirve es contarla como evidencia
-- de en que concepto fallas.
--
-- `v_conceptos_fallados` (0009) queda intacta: nunca se edita una migracion aplicada, y sigue
-- siendo la cuenta sin filtrar por si alguna vez se quiere mirar todo.

create or replace view v_conceptos_fallados_rapida as
select
  a.concepto,
  count(*)::int                    as intentos,
  count(distinct a.puzzle_id)::int as ejercicios,
  -- Cuantas veces ese concepto aparecio en un PRIMER intento, y cuantas de esas acertaste: es la
  -- tasa de acierto del panel, y solo tiene sentido sobre el primer intento, igual que SM-2.
  count(*) filter (where a.attempt_no = 1)::int                     as primeros,
  count(*) filter (where a.attempt_no = 1 and a.correct)::int       as aciertos,
  max(a.attempted_at)              as ultimo
from puzzle_attempts a
join puzzles p on p.id = a.puzzle_id
join games   g on g.id = p.game_id
where a.concepto is not null
  and g.time_class = 'rapid'
group by a.concepto;

alter view v_conceptos_fallados_rapida set (security_invoker = on);

-- Los roles `anon` y `authenticated` los crea Supabase, no PostgreSQL: en un Postgres comun (el
-- de los tests de integracion) no existen y un `revoke` pelado aborta la migracion entera.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.v_conceptos_fallados_rapida from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.v_conceptos_fallados_rapida from authenticated;
  end if;
end $$;

comment on view v_conceptos_fallados_rapida is
  'En que conceptos se falla mas, contando intentos, SOLO en partidas de rapida. En bala y blitz '
  'un error dice mas del reloj que de lo que el jugador entiende.';
