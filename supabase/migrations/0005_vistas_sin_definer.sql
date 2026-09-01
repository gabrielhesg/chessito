-- Chessito · cerrar el hueco de las vistas
--
-- Que encontro el linter de Supabase: las quince vistas quedaron como "Security Definer View",
-- en CRITICAL. No es un falso positivo, y el esquema base tampoco esta mal: es la combinacion
-- de dos cosas razonables por separado.
--
--   1. 0001_init.sql activa RLS en todas las tablas y NO define politicas, o sea deniega todo.
--      Eso protege las TABLAS.
--   2. Una vista creada por `postgres` se ejecuta, por omision, con los permisos de quien la
--      definio y no de quien la consulta. Es decir, la vista se salta el RLS de las tablas que
--      lee. Y Supabase, por omision, le da SELECT sobre lo que hay en `public` a los roles
--      `anon` y `authenticated`.
--
-- Juntando las dos: cualquiera con la anon key —que viaja al navegador y es publica por
-- diseno— podia leer las quince vistas y con ellas el historico agregado. Las tablas estaban
-- cerradas y las vistas quedaron abiertas por la puerta de al lado.
--
-- La regla del proyecto es explicita: "RLS habilitado en todas las tablas, sin politicas, y
-- acceso solo del lado servidor" (docs/ENGINEERING.md seccion 9). Esta migracion la hace
-- cumplir de verdad, con dos candados independientes:
--
--   a) `security_invoker = on` en cada vista: pasa a ejecutarse con los permisos de quien
--      consulta, asi que el RLS de las tablas vuelve a aplicar. Requiere Postgres 15+.
--   b) Revocar los privilegios de `anon` y `authenticated` sobre todo lo que hay en `public`,
--      y quitar el default que se los volveria a dar a los objetos futuros.
--
-- El acceso de la app no cambia: usa la service role key, que salta RLS por definicion, y es
-- la unica que toca los datos (`lib/supabase/admin.ts`, con `import 'server-only'`).
--
-- Para revertir: `alter view ... set (security_invoker = off)` en cada vista y volver a
-- otorgar los grants. No hay razon para hacerlo.

-- ============================================================
-- a) las vistas se ejecutan con los permisos de quien consulta
-- ============================================================
do $$
declare
  vista record;
begin
  for vista in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
  loop
    execute format('alter view public.%I set (security_invoker = on)', vista.relname);
  end loop;
end;
$$;

-- ============================================================
-- b) anon y authenticated no tienen nada que hacer en public
-- ============================================================
-- Guardado por la existencia de los roles: los crea Supabase, y este mismo esquema tiene que
-- poder correr en un Postgres comun (asi se verifica en CI y asi se corrieron las migraciones
-- contra un PostgreSQL 16 pelado).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all functions in schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
    alter default privileges in schema public revoke all on functions from anon;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    revoke all on all sequences in schema public from authenticated;
    revoke all on all functions in schema public from authenticated;
    alter default privileges in schema public revoke all on tables from authenticated;
    alter default privileges in schema public revoke all on sequences from authenticated;
    alter default privileges in schema public revoke all on functions from authenticated;
  end if;
end;
$$;
