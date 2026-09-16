-- Fase 1 de la revision integral (docs/review/PLAN-REVISION.md).
--
-- Cinco cosas, todas reversibles y ninguna destructiva:
--   1. `games.skip_reason`, para que "excluida del analisis" deje de ser un estado sin motivo.
--   2. Devolver a `pending` las partidas marcadas `skipped` que no tienen ningun motivo valido.
--   3. `v_cobertura_analisis`, que a diferencia de `v_analysis_coverage` SUMA su propio n_games.
--   4. `v_games_para_refase` y `v_conceptos_panel`, las dos vistas que necesitan `moves:rephase`
--      y el panel del entrenador.
--   5. Cuatro chequeos nuevos en `v_data_quality`, de una familia que no existia: no vigilan que
--      el calculo este bien, vigilan que el numero se calcule sobre la poblacion que declara.
--
-- Ninguna migracion anterior se edita. `v_analysis_coverage` (0001) y `v_conceptos_fallados_rapida`
-- (0010) quedan intactas.
--
-- Como revertir el punto 2, si hiciera falta:
--   update games set analysis_state = 'skipped'
--    where skip_reason is null and analysis_state = 'pending' and repuesta_por_0011;
-- Para poder hacerlo, el punto 2 deja marca: las filas repuestas quedan con
-- `skip_reason = null` Y `analysis_state = 'pending'`, y son exactamente las que antes estaban
-- en `skipped` sin motivo. No se borra ni se pierde ninguna fila.

-- ============================================================
-- 1 · el motivo de la exclusion
-- ============================================================
-- Un dato excluido siempre se nombra. Hasta ahora `skipped` era terminal y mudo, y por eso
-- 4.777 partidas jugables quedaron fuera del motor sin que ningun chequeo lo notara: 1.406 de
-- ellas de rapida, con todas sus jugadas y todos sus relojes extraidos.
alter table games add column if not exists skip_reason text;

comment on column games.skip_reason is
  'Por que la partida esta fuera del analisis con motor: variante, correspondencia, daily o '
  'sin_jugadas. NULL en toda partida analizable. Si analysis_state = skipped y skip_reason es '
  'NULL, hay un bug: lo vigila el chequeo skipped_sin_motivo.';

-- Motivo para las exclusiones que SI son legitimas. Son las tres condiciones de
-- lib/chess/game.ts y la de markMovesEmpty, escritas en SQL.
update games set skip_reason = 'variante'
 where analysis_state = 'skipped' and skip_reason is null and rules <> 'chess';

update games set skip_reason = 'daily'
 where analysis_state = 'skipped' and skip_reason is null and time_class = 'daily';

update games set skip_reason = 'correspondencia'
 where analysis_state = 'skipped' and skip_reason is null
   and (time_control = '-' or time_control ~ '^1/[0-9]+$');

update games set skip_reason = 'sin_jugadas'
 where analysis_state = 'skipped' and skip_reason is null and ply_count = 0;

-- ============================================================
-- 2 · devolver a la cola lo que nunca debio salir de ella
-- ============================================================
-- Lo que queda en `skipped` sin motivo son partidas normales con sus jugadas ya extraidas.
-- No se borra nada: solo vuelven al estado del que salieron. El motor las va a tomar cuando le
-- toque, y el orden de `claimBatch` (lib/analysis/store.ts) ahora pone rapida primero.
update games
   set analysis_state = 'pending'
 where analysis_state = 'skipped'
   and skip_reason is null
   and exists (select 1 from moves m where m.game_id = games.id);

-- ============================================================
-- 3 · cobertura que suma
-- ============================================================
-- `v_analysis_coverage` (0001) expone n_games, n_analyzed, n_pending y n_failed, y sus columnas
-- NO suman su propio total: en rapida da 2.588 / 108 / 1.074 / 0, y 108+1.074 != 2.588. Las
-- `skipped` desaparecen del denominador sin dejar rastro, que es justo lo que permitio que el
-- problema de arriba fuera invisible durante todo el historico.
create or replace view v_cobertura_analisis as
select
  g.time_class,
  count(*)::int                                                          as n_games,
  count(*) filter (where g.analysis_state = 'done')::int                 as n_analyzed,
  count(*) filter (where g.analysis_state = 'pending')::int              as n_pending,
  count(*) filter (where g.analysis_state = 'claimed')::int              as n_claimed,
  count(*) filter (where g.analysis_state = 'failed')::int               as n_failed,
  count(*) filter (where g.analysis_state = 'skipped')::int              as n_skipped,
  -- Lo analizable es el denominador honesto de la cobertura: el total menos lo que esta
  -- excluido POR UN MOTIVO.
  count(*) filter (where g.skip_reason is null)::int                     as n_analizables
from games g
group by g.time_class;

alter view v_cobertura_analisis set (security_invoker = on);

comment on view v_cobertura_analisis is
  'Cobertura del analisis por clase de tiempo, con todas las columnas de estado para que sumen '
  'n_games. Reemplaza a v_analysis_coverage (0001), que omitia skipped y claimed.';

-- ============================================================
-- 4a · partidas para `moves:rephase`
-- ============================================================
-- El espejo de `v_games_pending_moves` (0006): aquella busca las partidas SIN filas en `moves`,
-- esta las que SI las tienen, para re-derivar `phase`. Igual que aquella, existe porque
-- PostgREST no puede expresar el `exists (select 1 from moves ...)`; `PgIngestStore` hace la
-- misma consulta directo en SQL y no la usa.
create or replace view v_games_para_refase as
select
  g.id,
  g.pgn,
  g.my_color,
  g.base_seconds,
  g.increment_secs,
  o.ply_count as opening_ply_count
from games g
left join openings o on o.id = g.opening_id
where exists (select 1 from moves m where m.game_id = g.id);

alter view v_games_para_refase set (security_invoker = on);

comment on view v_games_para_refase is
  'Partidas con filas en moves, para que moves:rephase re-derive la columna phase desde el PGN.';

-- ============================================================
-- 4b · el panel de patrones del entrenador, sin la tasa imposible
-- ============================================================
-- `v_conceptos_fallados_rapida` (0010) calcula
--   aciertos = count(*) filter (attempt_no = 1 and correct)
-- dentro de un `where concepto is not null`, y `concepto` SOLO se escribe cuando se falla
-- (lib/spaced-repetition/actions.ts). O sea: aciertos es estructuralmente cero y no puede valer
-- otra cosa, ni con 500 ejercicios. El panel del entrenador mostraba 0% en las tres lineas.
--
-- Esta vista no intenta arreglar la tasa: la QUITA. La regla que el proyecto se dio en la Fase 12
-- aplica al pie de la letra — un dato se borra cuando se puede demostrar que no significa nada.
-- Lo que queda es el conteo de intentos por concepto, con el `n` de la unidad independiente
-- (ejercicios distintos), que es lo unico honesto: 170 intentos sobre 3 ejercicios son 3
-- observaciones, no 170.
--
-- Y a diferencia de 0010, NO filtra por clase de tiempo. El filtro de rapida pertenece a
-- /errores, que mide partidas; los intentos ocurren en el entrenador, que sirve ejercicios de
-- todas las clases por decision explicita de la Fase 12. Cruzar las dos poblaciones dejaba el
-- panel con n=3.
create or replace view v_conceptos_panel as
select
  a.concepto,
  count(*)::int                                          as intentos,
  count(distinct a.puzzle_id)::int                       as ejercicios,
  max(a.attempted_at)                                    as ultimo,
  -- El residuo. `empeora_la_posicion` es el cajon de "ninguno de los otros" y se lleva el 74% de
  -- los intentos: mostrarlo como si fuera un patron es nombrar una debilidad que no existe.
  (a.concepto = 'empeora_la_posicion')                   as es_residuo
from puzzle_attempts a
where a.concepto is not null
group by a.concepto;

alter view v_conceptos_panel set (security_invoker = on);

comment on view v_conceptos_panel is
  'En que conceptos se falla mas, contando intentos y ejercicios distintos. Sin tasa de acierto: '
  'ver el comentario de la migracion 0011. Reemplaza a v_conceptos_fallados_rapida (0010).';

-- ============================================================
-- 5 · cuatro chequeos nuevos
-- ============================================================
-- Los diez chequeos que existian vigilan que el CALCULO este bien (signos, clampeo, conteos,
-- parseo). Ninguno vigila que el numero se calcule sobre la POBLACION que declara, y todos los
-- fallos graves que encontro la revision integral son de esa segunda familia: por eso estaban
-- los diez en verde mientras 4.777 partidas jugables estaban fuera del motor.
--
-- `v_data_quality` es `create or replace view`, asi que se extiende sin editar 0002. Los diez
-- originales se repiten tal cual.
create or replace view v_data_quality as

  select 'tiempos_de_jugada_negativos'::text as check_name,
         count(*)                             as offenders,
         count(*) = 0                         as ok,
         'move_time_ms nunca puede ser negativo tras el clampeo'::text as descripcion
  from moves where move_time_ms < 0

union all
  select 'partidas_analizadas_sin_jugadas',
         count(*), count(*) = 0,
         'una partida en estado done tiene que tener filas en moves'
  from games g
  where g.analysis_state = 'done'
    and not exists (select 1 from moves m where m.game_id = g.id)

union all
  select 'conteo_de_jugadas_no_calza',
         count(*), count(*) = 0,
         'las filas en moves tienen que coincidir con games.ply_count'
  from (
    select g.id from games g
    join moves m on m.game_id = g.id
    where g.analysis_state = 'done'
    group by g.id, g.ply_count
    having count(m.ply) <> g.ply_count
  ) t

union all
  select 'clasificacion_sin_metrica',
         count(*), count(*) = 0,
         'no puede haber classification sin win_pct_loss que la justifique'
  from moves where classification is not null and win_pct_loss is null

union all
  select 'perdidas_negativas',
         count(*), count(*) = 0,
         'win_pct_loss y cp_loss son siempre mayores o iguales a cero. Si no, el signo está mal'
  from moves where win_pct_loss < 0 or cp_loss < 0

union all
  select 'errores_solo_de_un_color',
         count(*), count(*) = 0,
         'si un color no tiene NINGUN error grave registrado, el paso 2 del signo está mal'
  from (
    select g.my_color
    from games g
    where g.analysis_state = 'done'
    group by g.my_color
    having count(*) >= 20
       and sum(coalesce(g.blunders, 0)) = 0
  ) t

union all
  select 'partidas_reclamadas_huerfanas',
         count(*), count(*) = 0,
         'partidas en claimed hace más de 30 minutos: el analizador murió a medio camino'
  from games
  where analysis_state = 'claimed' and claimed_at < now() - interval '30 minutes'

union all
  select 'mezcla_de_motores',
         count(distinct engine_id), count(distinct engine_id) <= 1,
         'dos versiones de motor en la misma tabla hacen incomparables las evaluaciones'
  from games where analysis_state = 'done' and engine_id is not null

union all
  select 'aperturas_sin_resolver',
         count(*),
         count(*) * 100.0 / greatest((select count(*) from games where rules = 'chess'), 1) < 5,
         'menos del 5% de las partidas puede quedar sin apertura resuelta por EPD'
  from games where rules = 'chess' and opening_id is null

union all
  select 'evaluaciones_fuera_de_rango',
         count(*), count(*) = 0,
         'eval_cp fuera de mas menos 15000 indica un error de parseo del motor'
  from moves where abs(eval_cp) > 15000

-- --- los cuatro nuevos ---

union all
  select 'skipped_sin_motivo',
         count(*), count(*) = 0,
         'una partida excluida del analisis tiene que decir por que. Este chequeo es el que '
         'faltaba cuando 4.777 partidas jugables quedaron fuera del motor en silencio'
  from games where analysis_state = 'skipped' and skip_reason is null

union all
  select 'estados_no_suman',
         count(*), count(*) = 0,
         'los estados de analysis_state tienen que sumar el total de partidas de cada clase: '
         'si no, la cobertura que muestran las paginas pierde filas por el camino'
  from (
    select time_class
    from games
    group by time_class
    having count(*) <> count(*) filter (where analysis_state in
             ('done', 'pending', 'claimed', 'failed', 'skipped'))
  ) t

union all
  select 'cobertura_sesgada_por_clase',
         greatest(0, round(
           coalesce((select 100.0 * n_analyzed / nullif(n_analizables, 0)
                       from v_cobertura_analisis where time_class = 'blitz'), 0)
         - coalesce((select 100.0 * n_analyzed / nullif(n_analizables, 0)
                       from v_cobertura_analisis where time_class = 'rapid'), 0)
         ))::bigint,
         coalesce((select 100.0 * n_analyzed / nullif(n_analizables, 0)
                     from v_cobertura_analisis where time_class = 'rapid'), 0)
         >= coalesce((select 100.0 * n_analyzed / nullif(n_analizables, 0)
                     from v_cobertura_analisis where time_class = 'blitz'), 0),
         'la cobertura de rapida no puede ser menor que la de blitz: el spec pide analizar '
         'rapida primero, y /errores solo mira rapida'

union all
  select 'fase_final_implausible',
         count(*) filter (where phase = 2),
         coalesce(count(*) filter (where phase = 2) * 100.0 / nullif(count(*), 0), 0) < 35,
         'mas del 35% de las jugadas propias en fase final significa que el umbral de '
         'lib/chess/phase.ts esta mal calibrado, no que se jueguen muchos finales'
  from moves where is_mine;

-- ============================================================
-- 6 · dos vistas que sacan agregaciones de TypeScript
-- ============================================================
-- La regla del proyecto es explicita: "las agregaciones entre filas viven en vistas SQL, no en
-- TypeScript". `dueByTheme` agrupaba en memoria sobre un `limit(1000)` arbitrario, que con 397
-- vencidos funciona y con 1.200 daria un desglose incompleto SIN AVISAR. Es el peor tipo de
-- error: correcto hoy, incorrecto en tres meses, identico en pantalla.
create or replace view v_ejercicios_vencidos_por_tema as
select
  p.theme,
  count(*)::int as n
from puzzles p
where p.due_at <= now()
group by p.theme;

alter view v_ejercicios_vencidos_por_tema set (security_invoker = on);

comment on view v_ejercicios_vencidos_por_tema is
  'Ejercicios vencidos agrupados por patron tactico. Reemplaza la agregacion en TypeScript de '
  'dueByTheme, que truncaba en silencio a 1000 filas.';

-- El formato exacto dentro de rapida. Su plan declara 15+10 y el historico tiene 19 partidas en
-- 900+10 contra 2.569 en 600: la app no podia notar una desviacion del plan que sus propios
-- datos contienen, porque ninguna vista agrupaba por control de tiempo.
create or replace view v_rapida_por_formato as
select
  to_char(g.end_time at time zone 'America/Santiago', 'YYYY-MM') as month_local,
  g.time_control,
  count(*)::int as n
from games g
where g.rules = 'chess' and g.time_class = 'rapid'
group by 1, 2;

alter view v_rapida_por_formato set (security_invoker = on);

comment on view v_rapida_por_formato is
  'Partidas de rapida por mes local y control de tiempo exacto, para distinguir 10+0 de 15+10.';

-- ============================================================
-- 7 · candados para los roles de Supabase
-- ============================================================
-- Igual que 0006, 0008, 0009 y 0010: las vistas nuevas no se sirven con la anon key, que viaja
-- al navegador. `anon` y `authenticated` los crea Supabase, no PostgreSQL: en el Postgres comun
-- de los tests no existen y un `revoke` pelado abortaria la migracion entera.
do $$
declare
  v text;
begin
  foreach v in array array[
    'v_cobertura_analisis', 'v_games_para_refase', 'v_conceptos_panel',
    'v_ejercicios_vencidos_por_tema', 'v_rapida_por_formato'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', v);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', v);
    end if;
  end loop;
end $$;
