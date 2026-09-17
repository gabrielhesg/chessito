-- Chessito · Revisión integral, Fase 2 · F2-03: la sesión dirigida y el autodiagnóstico
--
-- Dos cosas, las dos sobre lo que ya existe.
--
-- 1. La cola de ejercicios dejaba de elegirse por `due_at` a secas. El problema medido: los
--    ejercicios se construyen desde TODAS las clases (decisión deliberada de la Fase 12, porque
--    una posición perdida en blitz entrena igual de bien), así que la cola servía lo que venciera
--    primero, sin ninguna relación con la partida que el alumno acababa de perder. "Entrena los
--    errores de tu derrota de ayer" era exactamente lo que la app NO podía hacer.
--
-- 2. `puzzle_attempts.concepto_elegido`: qué cree el alumno que pasó, al lado de lo que la app
--    calculó que pasó (`concepto`, de la Fase 8). Con esas dos columnas juntas aparece una
--    métrica que hoy no existe: no solo qué error comete, sino cuáles RECONOCE. Un error que
--    comete y reconoce se corrige con práctica; uno que comete y no reconoce necesita estudio.
--    Son dos tratamientos distintos y hasta ahora no había forma de separarlos.

alter table puzzle_attempts add column if not exists concepto_elegido text;

comment on column puzzle_attempts.concepto_elegido is
  'Lo que el alumno dice que le paso, elegido de una lista cerrada al fallar. Se compara contra '
  '`concepto`, que es lo que la app derivo de la linea de refutacion. Null cuando acerto (no se '
  'pregunta) o cuando la pregunta no se contesto.';

-- ============================================================
-- La cola, con prioridad explícita
-- ============================================================
-- `prioridad = 0` son los ejercicios que vienen de una derrota de rápida de los últimos 7 días:
-- la partida todavía se recuerda, así que el ejercicio enseña el doble. El resto va por `due_at`
-- como siempre. Siete días y no treinta (que es la ventana de `v_derrotas_sin_revisar`) porque
-- acá no se trata de saldar una cola sino de aprovechar la memoria fresca de la partida.
--
-- La vista NO filtra por vencido: eso lo decide quien la lee, porque el botón "entrenar los
-- errores de esta partida" sirve ejercicios aunque la repetición espaciada no los tuviera
-- programados todavía — misma decisión que ya tomó `puzzleAt` en la Fase 6.
create or replace view v_cola_de_ejercicios as
select
  p.*,
  case
    when g.time_class = 'rapid'
     and g.result = 'loss'
     and g.end_time > now() - interval '7 days'
    then 0
    else 1
  end               as prioridad,
  g.end_time        as partida_terminada,
  g.time_class      as partida_time_class,
  g.opp_username    as partida_rival
from puzzles p
join games g on g.id = p.game_id;

alter view v_cola_de_ejercicios set (security_invoker = on);

comment on view v_cola_de_ejercicios is
  'Ejercicios con la prioridad de la sesion dirigida y los datos de su partida de origen. '
  'prioridad 0 = viene de una derrota de rapida de los ultimos 7 dias.';

-- Cuantos ejercicios tiene cada partida, para el boton "entrenar los N errores de esta partida".
-- Cuenta TODOS los de la partida, vencidos o no, que es lo que ese boton sirve.
create or replace view v_ejercicios_por_partida as
select
  p.game_id,
  count(*)::int                                                   as n,
  count(*) filter (where p.due_at <= now())::int                  as n_vencidos
from puzzles p
group by p.game_id;

alter view v_ejercicios_por_partida set (security_invoker = on);

comment on view v_ejercicios_por_partida is
  'Ejercicios por partida. `n` es lo que anuncia el boton de /partida; `n_vencidos` es lo que la '
  'repeticion espaciada ya tenia programado.';

-- Lo que reconoce y lo que no: `concepto` es lo que la app calculo, `concepto_elegido` lo que el
-- alumno dijo. Solo rapida, igual que `v_conceptos_fallados_rapida` (0010) y por la misma razon.
create or replace view v_reconocimiento as
select
  a.concepto,
  count(*)::int                                                          as n,
  count(*) filter (where a.concepto_elegido = a.concepto)::int           as reconocidos,
  count(*) filter (where a.concepto_elegido is not null)::int            as contestados
from puzzle_attempts a
join puzzles p on p.id = a.puzzle_id
join games  g on g.id = p.game_id
where not a.correct
  and a.concepto is not null
  and g.time_class = 'rapid'
group by a.concepto;

alter view v_reconocimiento set (security_invoker = on);

comment on view v_reconocimiento is
  'Por concepto: cuantas veces se fallo, cuantas se contesto la pregunta de un tap, y en cuantas '
  'el alumno nombro el mismo error que la app calculo. `contestados` es el denominador honesto: '
  'la tasa se lee sobre lo contestado, no sobre todos los fallos.';

do $$
declare
  v text;
begin
  foreach v in array array['v_cola_de_ejercicios', 'v_ejercicios_por_partida', 'v_reconocimiento'] loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on public.%I from anon', v);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on public.%I from authenticated', v);
    end if;
  end loop;
end $$;
