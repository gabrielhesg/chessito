-- Fase 8: el entrenador ahora nombra EN QUE te equivocaste, no solo si acertaste.
--
-- `puzzles.theme` ya existia, pero describe el error ORIGINAL de la partida. Esto es distinto:
-- describe la jugada que se probo en el ejercicio, que puede ser otra. Es la diferencia entre
-- "este ejercicio es de pieza colgada" y "TU acabas de colgar una pieza".
--
-- Sin esto no se puede responder la pregunta que de verdad sirve para mejorar: "¿en que concepto
-- fallo mas?". Y esa pregunta es la que habilita servir OTRO ejercicio del MISMO concepto, que es
-- lo que transfiere a la partida real — repetir la misma posicion solo entrena a recordar la
-- respuesta.

alter table puzzle_attempts
  add column if not exists concepto text;

comment on column puzzle_attempts.concepto is
  'En que concepto fallo este intento (pieza_colgada, permite_mate, ...), derivado por '
  'lib/puzzles/explain.ts sobre la jugada REALMENTE probada. Null si acerto o si la jugada no '
  'fue lo bastante mala como para nombrar un concepto.';

-- La agregacion entre filas vive en SQL, no en TypeScript: regla del proyecto.
--
-- Cuenta INTENTOS, no ejercicios: si el mismo error se repite en cinco ejercicios distintos, eso
-- es exactamente lo que hay que ver. Solo cuenta los intentos fallados, que son los que tienen
-- concepto.
create or replace view v_conceptos_fallados as
select
  concepto,
  count(*)::int                                          as intentos,
  count(distinct puzzle_id)::int                         as ejercicios,
  max(attempted_at)                                      as ultimo
from puzzle_attempts
where concepto is not null
group by concepto;

alter view v_conceptos_fallados set (security_invoker = on);

-- Los roles `anon` y `authenticated` los crea Supabase, no PostgreSQL: en un Postgres comun (el
-- de los tests de integracion) no existen y un `revoke` pelado aborta la migracion entera. Mismo
-- guardado que usan 0005, 0006 y 0008.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.v_conceptos_fallados from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.v_conceptos_fallados from authenticated;
  end if;
end $$;

comment on view v_conceptos_fallados is
  'En que conceptos se falla mas, contando intentos. Alimenta el panel de patrones del entrenador.';
