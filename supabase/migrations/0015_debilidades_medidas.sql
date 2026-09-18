-- Chessito · Revisión integral, Fase 3 · Las dos debilidades, medidas
--
-- Esta fase existe para responder dos preguntas que la app no podía tocar: "¿dejé de colgar
-- piezas?" y "¿estoy aprendiendo a convertir?". Son las dos debilidades que el alumno declaró de
-- su propia boca y ninguna tenía una sola medición.
--
-- Todo lo de acá sale de `moves`, que ya tiene la evaluación y la clasificación de las jugadas de
-- LOS DOS bandos desde la Fase 3. No hace falta motor nuevo: lo que faltaba era mirar.
--
-- **La trampa del signo, otra vez.** `moves.eval_cp` está en perspectiva de blancas (trampa 2 de
-- CLAUDE.md). Para saber si la posición estaba bien PARA GABRIEL hay que girarla según
-- `games.my_color`. Sin eso, "llegaste a +200 y no ganaste" mide las partidas donde el RIVAL
-- estaba mejor cada vez que juega con negras — o sea la mitad del histórico, en silencio.

-- ============================================================
-- 1 · La North Star, por partida
-- ============================================================
-- El corte por `cp_loss >= 250` viene del spec de la revisión, que lo pide para separar colgar
-- material de un error posicional.
--
-- **Medido en producción antes de construir esto: hoy el corte no excluye ni una jugada.** Los
-- 1.857 errores graves de rápida tienen `cp_loss >= 339`, con mediana 622. La razón es que la
-- clase 3 se define por una caída de win% >= 30, y a este nivel una caída así ya implica material.
-- O sea que, con estos datos, "piezas colgadas por partida" y "graves por partida" son el mismo
-- número — y eso es un hallazgo sobre el jugador, no un error de la métrica: a 1250 **todo error
-- grave cuesta material**, no hay blunders posicionales.
--
-- El corte se deja igual y las dos columnas conviven a propósito: el día en que dejen de
-- coincidir, se va a ver. Una métrica que se llama como algo que no mide es peor que una que
-- coincide con otra.
create or replace view v_piezas_colgadas_por_partida as
select
  g.id                                                            as game_id,
  g.end_time,
  to_char(g.end_time at time zone 'America/Santiago', 'YYYY-MM')  as month_local,
  g.result,
  count(*) filter (
    where m.is_mine and not m.is_book and not m.is_decided
      and m.classification = 3 and m.cp_loss >= 250
  )::int                                                          as piezas_colgadas,
  count(*) filter (
    where m.is_mine and not m.is_book and not m.is_decided and m.classification = 3
  )::int                                                          as graves,
  count(*) filter (where m.is_mine and not m.is_book and not m.is_decided)::int as jugadas_propias,
  sum(m.win_pct_loss) filter (
    where m.is_mine and not m.is_book and not m.is_decided
  )::real                                                         as win_pct_perdido
from games g
join moves m on m.game_id = g.id
where g.rules = 'chess' and g.time_class = 'rapid' and g.analysis_state = 'done'
group by g.id, g.end_time, g.result;

alter view v_piezas_colgadas_por_partida set (security_invoker = on);

comment on view v_piezas_colgadas_por_partida is
  'Una fila por partida de rapida analizada. `piezas_colgadas` lleva el corte de cp_loss >= 250 '
  'que la separa del error posicional; `graves` son todos los de clase 3, sin ese corte.';

-- La North Star sobre la ventana de 20, con su metrica de apoyo.
--
-- PVR va **normalizado por jugada** y esa division no es un detalle: el PVR original es una SUMA
-- sobre jugadas propias, asi que una partida de 80 jugadas regala mas que una de 30 aunque se
-- juegue mejor. Sin dividir, la metrica premia perder rapido.
--
-- Mediana y no promedio para PVR: una sola partida catastrofica corre el promedio de la ventana
-- entera y hace ver un cambio de tendencia donde hubo un mal dia.
create or replace view v_north_star as
select
  count(*)::int                                                                as n,
  avg(u.piezas_colgadas)::real                                                 as piezas_por_partida,
  avg(u.graves)::real                                                          as graves_por_partida,
  percentile_cont(0.5) within group (
    order by u.win_pct_perdido / nullif(u.jugadas_propias, 0)
  )::real                                                                      as pvr_por_jugada,
  min(u.end_time)                                                              as desde,
  max(u.end_time)                                                              as hasta
from (
  select * from v_piezas_colgadas_por_partida order by end_time desc limit 20
) u;

alter view v_north_star set (security_invoker = on);

comment on view v_north_star is
  'La North Star sobre las ultimas 20 partidas de rapida analizadas: piezas colgadas por partida. '
  'Menor es mejor. `pvr_por_jugada` es la metrica de apoyo, normalizada por jugada para que una '
  'partida larga no regale mas que una corta por ser larga.';

-- La serie mensual, que es lo que llena el bloque "Estas mejorando" de la portada.
create or replace view v_north_star_mensual as
select
  month_local,
  count(*)::int                                                                as n,
  avg(piezas_colgadas)::real                                                   as piezas_por_partida,
  avg(graves)::real                                                            as graves_por_partida,
  percentile_cont(0.5) within group (
    order by win_pct_perdido / nullif(jugadas_propias, 0)
  )::real                                                                      as pvr_por_jugada
from v_piezas_colgadas_por_partida
group by month_local;

alter view v_north_star_mensual set (security_invoker = on);

comment on view v_north_star_mensual is
  'Serie mensual de la North Star, solo rapida analizada. Expone su `n`: los meses bajo 20 se '
  'muestran atenuados y sin conclusion, como toda vista agregada del proyecto.';

-- ============================================================
-- 2 · Conversión de ventaja
-- ============================================================
-- La traduccion operativa de "no se que hacer en el medio juego". No se mide con una tasa de
-- blunder: se mide con que pasa cuando la posicion esta BIEN.
create or replace view v_ventaja_por_partida as
with evaluada as (
  select
    g.id                                                                       as game_id,
    g.end_time,
    g.result,
    g.opp_username,
    m.ply,
    -- El giro a la perspectiva de Gabriel. Sin esto, con negras se mide la ventaja del rival.
    case when g.my_color = 'white' then m.eval_cp else -m.eval_cp end          as eval_mio
  from games g
  join moves m on m.game_id = g.id
  where g.rules = 'chess' and g.time_class = 'rapid' and g.analysis_state = 'done'
    and not m.is_book and not m.is_decided and m.eval_cp is not null
),
maxima as (
  select
    game_id, end_time, result, opp_username,
    max(eval_mio)                                                              as ventaja_maxima,
    (array_agg(ply order by eval_mio desc, ply))[1]                            as ply_de_la_ventaja
  from evaluada
  group by game_id, end_time, result, opp_username
)
select
  x.game_id, x.end_time, x.result, x.opp_username, x.ventaja_maxima, x.ply_de_la_ventaja,
  -- El primer ply DESPUES del maximo en que la ventaja ya no esta. Es el que engancha con el
  -- entrenador: ahi el error no fue tactico, y es donde se aprende plan.
  (
    select min(e.ply) from evaluada e
     where e.game_id = x.game_id and e.ply > x.ply_de_la_ventaja and e.eval_mio < 50
  )                                                                            as ply_perdida
from maxima x;

alter view v_ventaja_por_partida set (security_invoker = on);

comment on view v_ventaja_por_partida is
  'Ventaja maxima alcanzada en cada partida de rapida analizada, en perspectiva de Gabriel, y el '
  'ply donde se perdio. `eval_cp` es perspectiva de blancas: el giro por my_color es obligatorio.';

create or replace view v_conversion_de_ventaja as
select
  count(*)::int                                                                as n,
  count(*) filter (where result = 'win')::int                                  as ganadas,
  count(*) filter (where result = 'draw')::int                                 as tablas,
  count(*) filter (where result = 'loss')::int                                 as perdidas,
  wilson_lower(
    (count(*) filter (where result = 'win'))::real, count(*)::int
  )                                                                            as conversion_lower
from (
  select * from v_ventaja_por_partida where ventaja_maxima >= 200 order by end_time desc limit 30
) u;

alter view v_conversion_de_ventaja set (security_invoker = on);

comment on view v_conversion_de_ventaja is
  'De las ultimas 30 partidas de rapida donde la evaluacion supero +200 a favor de Gabriel fuera '
  'del libro, cuantas termino ganando. Con cota de Wilson, que es la regla del proyecto para todo '
  'porcentaje.';

-- ============================================================
-- 3 · Los regalos del rival que no castigó
-- ============================================================
-- La app evalua las jugadas de los dos bandos y solo usaba las de Gabriel, y solo para
-- castigarlas. El espejo sale gratis: `moves.eval_cp` ya esta poblado para el rival.
--
-- "Aprovechado" no es "gane la partida": es que la jugada SIGUIENTE (la mia) no devolvio el
-- regalo. El margen de 50 cp es tolerancia de ruido del motor, no una jugada buena.
create or replace view v_regalos_del_rival as
with evaluada as (
  select
    g.id                                                                       as game_id,
    g.end_time,
    to_char(g.end_time at time zone 'America/Santiago', 'YYYY-MM')             as month_local,
    m.ply, m.is_mine, m.classification, m.is_book, m.is_decided,
    case when g.my_color = 'white' then m.eval_cp else -m.eval_cp end          as eval_mio,
    lead(case when g.my_color = 'white' then m.eval_cp else -m.eval_cp end)
      over (partition by g.id order by m.ply)                                  as eval_tras_mi_respuesta
  from games g
  join moves m on m.game_id = g.id
  where g.rules = 'chess' and g.time_class = 'rapid' and g.analysis_state = 'done'
    and m.eval_cp is not null
)
select
  game_id, month_local, end_time, ply, eval_mio, eval_tras_mi_respuesta,
  (eval_tras_mi_respuesta >= eval_mio - 50)                                    as aprovechado
from evaluada
where not is_mine and not is_book and not is_decided and classification = 3
  and eval_tras_mi_respuesta is not null;

alter view v_regalos_del_rival set (security_invoker = on);

comment on view v_regalos_del_rival is
  'Cada blunder del rival en rapida, con si la jugada siguiente de Gabriel devolvio el regalo. '
  'Es lo que Lichess llama Opportunism. Para 1250, "tuviste 14 regalos y aprovechaste 3" es mas '
  'util que cualquier tasa de error propia.';

create or replace view v_regalos_mensual as
select
  month_local,
  count(*)::int                                     as n,
  count(*) filter (where aprovechado)::int          as aprovechados,
  wilson_lower(
    (count(*) filter (where aprovechado))::real, count(*)::int
  )                                                 as aprovechamiento_lower
from v_regalos_del_rival
group by month_local;

alter view v_regalos_mensual set (security_invoker = on);

comment on view v_regalos_mensual is
  'Regalos del rival por mes y cuantos se aprovecharon, con cota de Wilson.';

do $$
declare
  v text;
begin
  foreach v in array array[
    'v_piezas_colgadas_por_partida', 'v_north_star', 'v_north_star_mensual',
    'v_ventaja_por_partida', 'v_conversion_de_ventaja', 'v_regalos_del_rival', 'v_regalos_mensual'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', v);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', v);
    end if;
  end loop;
end $$;
