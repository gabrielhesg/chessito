# Validación cruzada contra Lichess (Capa 2 de docs/CONFIANZA.md)

Ritual manual, una sola vez al terminar la Fase 3, después de correr el backfill completo del
analizador. No se automatiza porque el objetivo es exactamente que sea un par de ojos humanos
comparando contra un sistema que no es el nuestro.

## Cómo elegir las cinco partidas

No hay que hardcodear cinco `chesscom_uuid` de antemano: conviene elegirlas **después** de correr
el analizador, con datos reales, para que cubran los casos donde más vale la pena desconfiar.
Un criterio que cubre bien el terreno:

1. **Una paliza clara con blancas.** Una derrota con `blunders` alto y `divergence_ply` bajo
   (la partida se te tuerce temprano). Sirve para confirmar que el paso 1 de signo (normalizar
   a blancas) está bien en el caso "normal".
2. **Una paliza clara con negras.** El simétrico del punto 1, pero con negras — este es el caso
   que el paso 2 de signo (girar el delta según quién movió) puede arruinar en silencio. Si algo
   va a estar mal, es acá.
3. **Una partida pareja que se decide tarde.** `acpl` moderado en ambos lados, sin un blunder
   evidente, que se resuelve en el medio juego o el final. Sirve para ver si la clasificación por
   caída de win% (no por centipeones) coincide con el juicio de Lichess en posiciones donde no
   hay un error obvio.
4. **Un final largo.** `ply_count` alto, con varias jugadas después de que `phase = 2`. Sirve
   para confirmar que la fase se sigue calculando bien lejos de la apertura y que el motor no
   se comporta raro con pocas piezas en el tablero.
5. **La partida con el `divergence_ply` más bajo de todo el histórico** (la que la app dice que
   se te tuerce más temprano). Es la métrica más accionable del proyecto
   (docs/ANALYSIS-SPEC.md): si esta está mal, la funcionalidad más importante de `/aperturas`
   está mal.

Consulta para encontrarlas una vez que haya datos:

```sql
-- 1 y 2: palizas claras, una por color
select chesscom_uuid, my_color, blunders, divergence_ply, url
from games
where analysis_state = 'done' and result = 'loss' and blunders >= 3
order by divergence_ply asc nulls last
limit 10;

-- 3: pareja y larga
select chesscom_uuid, my_color, acpl, blunders, ply_count, url
from games
where analysis_state = 'done' and acpl between 20 and 60 and blunders <= 1
order by ply_count desc
limit 10;

-- 4: final largo
select chesscom_uuid, ply_count, url
from games
where analysis_state = 'done' and ply_count > 80
order by ply_count desc
limit 10;

-- 5: la divergencia mas temprana de todo el historico
select chesscom_uuid, my_color, divergence_ply, url
from games
where analysis_state = 'done' and divergence_ply is not null
order by divergence_ply asc
limit 10;
```

## El ritual, partida por partida

Para cada una de las cinco:

1. Abre la partida en chess.com (el link está en `games.url`) y cópiala a Lichess:
   **lichess.org → Import game** (pegas el PGN o la URL de chess.com) → **Analysis**.
2. En la app, abre `/registro`, filtra hasta encontrar la partida, y anota qué plies marca como
   error grave (`classification = 3`) — o consúltalo directo:
   ```sql
   select ply, is_mine, classification, cp_loss, win_pct_loss
   from moves
   where game_id = (select id from games where chesscom_uuid = '<uuid>')
     and classification is not null
   order by ply;
   ```
3. Compara jugada por jugada los plies que Lichess marca como "Blunder" (el ícono rojo) contra
   los que la app marca `classification = 3`.
4. Anota en la tabla de abajo lo que encontraste.

No tienen que coincidir al 100% — los presupuestos de búsqueda son distintos (800.000 nodos acá
contra lo que use Lichess). Lo que **sí** tiene que pasar: los errores graves grandes (una pieza
colgada, un mate perdido) aparecen en las dos. Si la app marca errores que Lichess no ve, o se le
pasan los que Lichess sí detecta, hay que investigar antes de confiar en el número.

## Resultado

| # | Partida (link) | Color / caso | Blunders app | Blunders Lichess | ¿Coinciden los grandes? | Notas |
|---|---|---|---|---|---|---|
| 1 | | paliza con blancas | | | | |
| 2 | | paliza con negras | | | | |
| 3 | | pareja, se decide tarde | | | | |
| 4 | | final largo | | | | |
| 5 | | mayor divergence_ply | | | | |

**Conclusión:** _(pendiente — completar después de correr las cinco)_
