-- Chessito · Revisión integral, Fase 2 · F2-01: el registro de la revisión de una derrota
--
-- El plan de entrenamiento tiene un ritual central — *toda derrota se analiza primero sin
-- motor* — y la app no tenía dónde anotar que eso pasó. Sin ese registro no existe la cola de
-- derrotas por revisar, la tarea 2 de la portada nunca se puede marcar hecha (hoy solo se marca
-- si NO hay ninguna derrota, que premia no jugar), y no hay manera de contrastar lo que el
-- alumno creyó con lo que dice el motor.
--
-- `motivo` es un enum y no texto libre a propósito: en el celular un chip es un tap y un teclado
-- es la fricción que mata el hábito. Y una lista cerrada es lo único que después se puede
-- agrupar; `nota` queda para lo que no cabe, siempre opcional y nunca en lugar del motivo.

create type review_motivo as enum (
  'colgue_material',
  'no_supe_que_hacer',
  'me_quede_sin_tiempo',
  'me_superaron_en_la_apertura',
  'otro'
);

create table if not exists game_reviews (
  game_id      bigint        primary key references games(id) on delete cascade,
  ply_marcado  int,
  motivo       review_motivo,
  nota         text,
  ply_del_motor int,
  creado_en    timestamptz   not null default now(),
  -- Marcar un ply sin decir por qué, o al revés, es media revisión: la fila existe cuando el
  -- alumno completó los dos gestos, o cuando se saltó el ritual a propósito (los dos en null).
  constraint game_reviews_completa check (
    (ply_marcado is null and motivo is null) or (ply_marcado is not null and motivo is not null)
  )
);

comment on table game_reviews is
  'Una fila por partida revisada. La clave primaria es game_id: revisar de nuevo pisa la fila '
  'anterior en vez de acumular, porque lo que interesa es el estado "revisada", no el historial.';

comment on column game_reviews.ply_marcado is
  'El ply donde el alumno cree que se perdio la partida, antes de ver el motor. Null cuando uso '
  'el boton de escape y se salto el ritual: eso tambien cuenta como revisada.';

comment on column game_reviews.ply_del_motor is
  'El ply que el motor senala, copiado al momento de revisar. Se guarda en vez de derivarse '
  'despues porque el analisis se puede re-correr con otra version de Stockfish, y entonces la '
  'comparacion "marcaste la 14, el motor dice la 8" ya no seria la que el alumno vio.';

-- RLS activado sin politicas = deniega todo, igual que las cinco tablas de 0001. Todo el acceso
-- es del lado servidor con la service role key, que salta RLS.
alter table game_reviews enable row level security;

-- ============================================================
-- La cola: derrotas de rapida RECIENTES sin revisar
-- ============================================================
-- Tres cortes, y ninguno es cosmetico:
--
-- 1. Solo rapida. Revisar bala no esta en el plan, y una cola con las 1.850 de bala adentro es
--    una cola que no se mira.
-- 2. Solo los ultimos 30 dias. El historico tiene 1.191 derrotas de rapida; sin ventana, la
--    portada diria "y 1.188 mas sin revisar", que es exactamente la deuda completa que la regla
--    del proyecto manda NO mostrar (la misma leccion que los 397 ejercicios vencidos). Medido en
--    produccion: 1 derrota en los ultimos 7 dias, 6 en 30 y 16 en 90. Treinta dias deja una cola
--    de seis, que si se puede terminar; noventa deja dieciseis, que ya se lee como deuda.
--    Y una derrota de hace ocho meses no se revisa: no se recuerda la partida.
-- 3. De la mas reciente hacia atras, por la misma razon.
--
-- La lista COMPLETA de pendientes sigue existiendo, en el filtro "sin revisar" de /registro, que
-- no usa esta vista: ahi se llega buscando, que es otra cosa que abrir la portada.
create or replace view v_derrotas_sin_revisar as
select
  g.id,
  g.end_time,
  g.opp_username,
  g.opp_rating,
  g.my_color,
  g.time_control,
  g.termination,
  g.analysis_state,
  count(*) over () as n_total
from games g
where g.rules = 'chess'
  and g.time_class = 'rapid'
  and g.result = 'loss'
  and g.end_time > now() - interval '30 days'
  and not exists (select 1 from game_reviews r where r.game_id = g.id)
order by g.end_time desc;

alter view v_derrotas_sin_revisar set (security_invoker = on);

comment on view v_derrotas_sin_revisar is
  'Derrotas de rapida de los ultimos 30 dias que todavia no se revisaron, de la mas reciente '
  'hacia atras. `n_total` viene como ventana sobre la misma consulta para que la portada pueda '
  'decir "y 5 mas" sin una segunda lectura. La ventana no es un detalle de presentacion: sin '
  'ella la cola son 1.191 partidas y la portada pasa a mostrar una deuda.';

-- Lo que el alumno dice que le pasa, agrupado. Es la mitad barata del diagnostico: no necesita
-- motor, solo que el ritual ocurra. Expone su `n` como toda vista agregada del proyecto.
create or replace view v_motivos_de_derrota as
select
  r.motivo,
  count(*)::int                                                  as n,
  count(*) filter (where r.ply_marcado = r.ply_del_motor)::int    as coincide_con_el_motor,
  avg(abs(r.ply_marcado - r.ply_del_motor))::real                 as plies_de_diferencia
from game_reviews r
where r.motivo is not null
group by r.motivo;

alter view v_motivos_de_derrota set (security_invoker = on);

comment on view v_motivos_de_derrota is
  'Motivos declarados por el alumno, con cuanto se aleja su ply marcado del que senala el motor. '
  'La distancia es el dato que ensena: un motivo acertado con el ply equivocado significa que '
  'reconoce el error pero no cuando empezo.';

-- Candados para los roles de Supabase, igual que de 0006 en adelante.
do $$
declare
  v text;
begin
  foreach v in array array['v_derrotas_sin_revisar', 'v_motivos_de_derrota'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', v);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', v);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.game_reviews from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.game_reviews from authenticated';
  end if;
end $$;
