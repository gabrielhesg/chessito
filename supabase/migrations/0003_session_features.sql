-- Chessito · funcion de sesiones para la ingesta
--
-- Nota sobre la reconciliacion (docs/CONFIANZA.md capa 4):
--   La idea original era comparar el conteo mensual de chess.com contra `v_games_by_month`.
--   No funciona, y se verifico contra el historico real: los archivos mensuales de chess.com
--   estan cortados por el INICIO de la partida, mientras que `games.end_time` es el final. Una
--   partida empezada el 30 de noviembre a las 23:50 aparece en el archivo 2024/11 y termina en
--   diciembre, asi que cualquier vista agrupada por `end_time` (en Santiago o en UTC) descuadra
--   en cada frontera de mes: en el historico de 2024-10 a 2026-08 esto produce doce meses con
--   diferencias que se cancelan de a pares (-8/+8, -15/+15...).
--
--   La ingesta reconcilia entonces por UUID: de las partidas que chess.com reporta en cada
--   archivo, cuenta cuantas quedaron efectivamente guardadas. Es una comprobacion mas fuerte
--   que el conteo, porque detecta la perdida exacta y sabe cual partida falta.
--
-- Para revertir: drop function recompute_session_features();

-- ============================================================
-- features de sesion, recalculadas al final de cada ingesta
-- ============================================================
-- Vive en SQL y no en TypeScript por dos razones: son agregaciones entre filas (regla del
-- proyecto) y asi la MISMA sentencia corre desde la app (via rpc), desde `pnpm ingest` y
-- desde los tests, sin dos implementaciones que puedan divergir.
--
-- Definicion de sesion (docs/DATA-SOURCES.md): dos partidas consecutivas son de la misma
-- sesion si el hueco entre ellas es menor a 40 minutos.

create or replace function recompute_session_features()
returns void
language plpgsql
as $$
begin
  with marked as (
    select id, end_time,
      case when end_time - lag(end_time) over (order by end_time, id) > interval '40 minutes'
             or lag(end_time) over (order by end_time, id) is null
      then 1 else 0 end as is_new_session
    from games where rules = 'chess'
  ),
  sessions as (
    select id, end_time,
           sum(is_new_session) over (order by end_time, id) as session_id
    from marked
  ),
  numbered as (
    select id, session_id,
           row_number() over (partition by session_id order by end_time, id) as game_in_session
    from sessions
  )
  update games g
     set session_id      = n.session_id,
         game_in_session = n.game_in_session
    from numbered n
   where g.id = n.id
     and (g.session_id is distinct from n.session_id
          or g.game_in_session is distinct from n.game_in_session);

  with prev as (
    select id,
           lag(result) over (partition by session_id order by end_time, id) as prev_result
    from games
    where rules = 'chess' and session_id is not null
  )
  update games g
     set prev_result = p.prev_result
    from prev p
   where g.id = p.id
     and g.prev_result is distinct from p.prev_result;
end;
$$;
