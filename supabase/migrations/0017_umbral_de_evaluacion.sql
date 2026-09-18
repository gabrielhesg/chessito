-- Chessito · Revisión integral · Recalibrar `evaluaciones_fuera_de_rango`
--
-- El chequeo se puso en rojo con UNA fila de 4,6 millones, y perseguirla dejó claro que el
-- umbral estaba mal, no el dato.
--
-- La fila: `moves.eval_cp = -19969`, `mate_in` NULL, en el ply 90 de una partida de rápida de
-- 118 plies, jugada del RIVAL, con `is_decided = true`, `cp_loss = 0` y `classification = 0`.
-- O sea que no entra en ninguna vista de errores ni en ninguna métrica suya.
--
-- Por qué no es un error de parseo: `lib/engine/protocol.ts:76` copia el número de `score cp N`
-- tal cual, sin aritmética, y `mate_in` es NULL, así que tampoco vino de `mateToCp` (que usa
-- ±10000). Stockfish 19 emitió ese centipeón de verdad — es el rango que usa para una posición
-- que considera ganada de forma terminal sin anunciar mate forzado.
--
-- El umbral de 15000 se eligió en 0002 para atrapar un error de parseo, y un error de parseo de
-- verdad se ve distinto: leer el `depth`, los `nodes` o el `nps` daría millones. El techo
-- correcto es el propio `VALUE_MATE` de Stockfish, 32000: nada legítimo puede superarlo. Queda
-- en 30000, que sigue atrapando basura y acepta lo que el motor emite.
--
-- **Esto NO es bajar la vara para que el tablero quede verde.** Un chequeo permanentemente rojo
-- por un caso legítimo es peor que no tenerlo: entrena a ignorar /salud, que es la pantalla que
-- sostiene la confianza en todas las demás. La vara se mueve cuando se puede demostrar dónde
-- estaba mal, y acá se puede.

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
         'eval_cp fuera de mas menos 30000 indica un error de parseo: nada legitimo supera el '
         'VALUE_MATE de Stockfish, que son 32000'
  from moves where abs(eval_cp) > 30000

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
  from moves where is_mine
union all
  -- Agregado al terminar la Fase 4, cuando la reingesta completa poblo `rated` en las 10.134.
  -- A partir de ahi, una fila sin `rated` solo puede venir de una ingesta que dejo de mandarlo:
  -- es una regresion, no un dato que falte. Antes de esa reingesta este chequeo habria estado
  -- rojo por diseno, que es la razon por la que no existia.
  select 'partidas_sin_rated',
         count(*), count(*) = 0,
         'toda partida ingerida trae `rated` del JSON de chess.com. Una fila sin el significa que '
         'la ingesta dejo de mapearlo'
  from games where rated is null;
