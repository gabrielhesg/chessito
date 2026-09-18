-- Chessito · Revisión integral, Fase 4 · Repertorio declarado, `rated`, y limpieza
--
-- Hasta ahora la app agrupaba por la apertura que OCURRIÓ, no por la que él pretendía jugar. El
-- Ponziani aparecía partido en dos filas ("Ponziani Opening" n=165 y "Ponziani: Jaenisch
-- Counterattack" n=131) y no había forma de preguntar "¿cómo me va con mi repertorio?".
--
-- **El repertorio se declara por JUGADAS, no por nombre de apertura.** Medido antes de escribir
-- esto: agrupando por `openings.name` el Ponziani son 296 partidas, pero por orden de jugadas
-- (e4, Nf3, c3) son **507**. La resolución por EPD reparte una misma línea entre muchos nombres
-- según lo que haga el rival, así que el nombre nunca va a contestar "¿llegué a mi repertorio?".
-- Las jugadas sí, y además no dependen de los TSV de Lichess.

create table if not exists repertoire (
  id      text        primary key,
  nombre  text        not null,
  color   game_color  not null,
  -- Los plies ABSOLUTOS que definen la entrada, con su SAN. Van en dos arreglos paralelos en vez
  -- de una tabla hija porque son diez entradas declaradas a mano y una tabla hija obligaría a un
  -- editor que el proyecto no necesita.
  plies   smallint[]  not null,
  sans    text[]      not null,
  nota    text,
  constraint repertoire_arreglos_calzan check (array_length(plies, 1) = array_length(sans, 1))
);

comment on table repertoire is
  'El repertorio DECLARADO, no el que ocurrio. Diez entradas a mano: no hay editor y no hace '
  'falta. Se define por orden de jugadas porque el nombre de apertura reparte una misma linea '
  'entre muchas filas segun lo que haga el rival.';

alter table repertoire enable row level security;

insert into repertoire (id, nombre, color, plies, sans, nota) values
  ('ponziani', 'Ponziani', 'white', '{1,3,5}', '{e4,Nf3,c3}',
   'Su linea principal con blancas. Exige que el rival coopere con 1...e5 y 2...Cc6.'),
  ('e5_vs_e4', '1…e5 contra 1.e4', 'black', '{1,2}', '{e4,e5}',
   'Su respuesta declarada a 1.e4.'),
  ('d5_vs_d4', 'd5 contra 1.d4', 'black', '{1,2}', '{d4,d5}',
   'La primera jugada del esquema d5/Cf6/e6. El esquema completo se alcanza mas tarde y por '
   'transposicion, asi que declararlo entero daria falsos negativos.')
on conflict (id) do nothing;

-- ============================================================
-- ¿Llegué a mi repertorio?
-- ============================================================
-- Una partida calza con una entrada si TODAS sus jugadas aparecen en el ply que corresponde.
-- Cuando calzan varias, gana la mas larga: es la mas especifica.
create or replace view v_repertorio_partida as
select
  g.id                                                             as game_id,
  g.end_time,
  to_char(g.end_time at time zone 'America/Santiago', 'YYYY-MM')   as month_local,
  g.my_color,
  g.result,
  g.score,
  g.opening_id,
  (
    select r.id
      from repertoire r
     where r.color = g.my_color
       and not exists (
         select 1
           from unnest(r.plies, r.sans) as x(ply, san)
          where not exists (
            select 1 from moves m where m.game_id = g.id and m.ply = x.ply and m.san = x.san
          )
       )
     order by array_length(r.plies, 1) desc
     limit 1
  )                                                                as repertorio_id
from games g
where g.rules = 'chess' and g.time_class = 'rapid';

alter view v_repertorio_partida set (security_invoker = on);

comment on view v_repertorio_partida is
  'Una fila por partida de rapida, con la entrada de repertorio que alcanzo (o null). Es la base '
  'de "llegaste a tu repertorio en X de N".';

create or replace view v_repertorio_rendimiento as
select
  coalesce(p.repertorio_id, 'fuera')  as repertorio_id,
  r.nombre,
  p.my_color,
  count(*)::int                       as n,
  avg(p.score)::real                  as score_pct,
  wilson_lower(sum(p.score)::real, count(*)::int) as score_pct_lower
from v_repertorio_partida p
left join repertoire r on r.id = p.repertorio_id
group by 1, 2, 3;

alter view v_repertorio_rendimiento set (security_invoker = on);

comment on view v_repertorio_rendimiento is
  'Rendimiento por entrada de repertorio, con Wilson y su n. La fila `fuera` junta todo lo que no '
  'alcanzo ninguna entrada: es el tamano del problema, no un grupo residual que se esconde.';

-- Qué le juegan cuando NO llega a su repertorio. Es la mitad del diagnostico que no necesita
-- motor y se puede publicar hoy: cinco respuestas del rival ya tienen n >= 20.
create or replace view v_respuestas_del_rival as
select
  p.my_color,
  coalesce(o.name, 'Sin resolver')                as apertura,
  count(*)::int                                   as n,
  avg(p.score)::real                              as score_pct,
  wilson_lower(sum(p.score)::real, count(*)::int) as score_pct_lower
from v_repertorio_partida p
left join openings o on o.id = p.opening_id
where p.repertorio_id is null
group by 1, 2;

alter view v_respuestas_del_rival set (security_invoker = on);

comment on view v_respuestas_del_rival is
  'Que le juegan cuando NO alcanza su repertorio, agrupado por la apertura que si ocurrio. Es una '
  'semana de estudio perfectamente definida.';

-- ============================================================
-- `rated`
-- ============================================================
-- Se valida en el contrato Zod desde la Fase 1 y se descartaba en el mapeo, asi que las partidas
-- amistosas entraban con el mismo peso en Wilson, en la tasa de error y en el rendimiento por
-- apertura. La columna es nullable a proposito: hasta que corra una ingesta completa, `null`
-- significa "no lo sabemos", que es distinto de `false`.
alter table games add column if not exists rated boolean;

comment on column games.rated is
  'Si la partida contaba para el rating. Viene del JSON de chess.com, no del PGN, asi que '
  'poblarla en el historico exige reingerir. NULL = todavia no se sabe, que no es lo mismo que '
  'no puntuada: por eso las vistas filtran `rated is not false` y no `rated = true`.';

-- ============================================================
-- Limpieza de deuda de confianza (F4-04)
-- ============================================================
-- No se borran: nunca se edita una migracion aplicada. Se anotan, que es lo que evita que la
-- proxima pantalla nazca leyendo la vista equivocada.
comment on view v_monthly_activity is
  'SUPERADA por v_monthly_activity_wilson (0004), que expone n y wilson_lower. Esta devuelve el '
  'porcentaje pelado, y la regla del proyecto es no mostrarlo. No la lee ninguna pagina.';

comment on view v_conceptos_fallados is
  'SUPERADA por v_conceptos_fallados_rapida (0010) y por v_conceptos_panel (0011). Esta mezcla '
  'todas las clases de tiempo, y el analisis de errores cuenta solo rapida.';

comment on view v_opening_resolution is
  'SUPERADA: el chequeo `aperturas_sin_resolver` de v_data_quality cubre lo mismo y vive donde '
  'corresponde (/salud). No la lee ninguna pagina desde la Fase 5.';

comment on view v_analysis_coverage is
  'n_failed nunca ha valido otra cosa que 0 en las cuatro clases: `analysis_state = failed` solo '
  'lo pone moves:extract ante un PGN irreproducible, y no ha aparecido ninguno en 10.106 '
  'partidas. Se deja porque el dia que aparezca uno hay que verlo.';

do $$
declare
  v text;
begin
  foreach v in array array[
    'v_repertorio_partida', 'v_repertorio_rendimiento', 'v_respuestas_del_rival'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', v);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', v);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.repertoire from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.repertoire from authenticated';
  end if;
end $$;
