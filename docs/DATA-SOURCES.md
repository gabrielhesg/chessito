# Fuentes de datos

## 1. chess.com Published Data API

Pública, sin autenticación, sin API key. Documentación oficial:
https://www.chess.com/news/view/published-data-api

### Endpoints que usa el proyecto

```
GET https://api.chess.com/pub/player/{username}/games/archives
```
Devuelve `{ "archives": [ "https://api.chess.com/pub/player/{u}/games/2026/08", ... ] }`.
Una URL por mes con partidas. Es la lista completa del histórico.

```
GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
```
Devuelve `{ "games": [ ... ] }` con todas las partidas terminadas de ese mes.

### Límites

La documentación es explícita: **el acceso serial es ilimitado.** Si siempre se espera la
respuesta anterior antes de pedir la siguiente, nunca hay rate limiting. Las peticiones en
paralelo sí reciben `429 Too Many Requests`.

Por lo tanto: **fetch serial, sin `Promise.all` sobre los archivos mensuales.** El histórico
completo son unos pocos minutos y se hace una sola vez.

Mandar un `User-Agent` identificable es buena práctica y evita bloqueos.

### Estructura de cada partida

Campos relevantes del objeto `game`:

| Campo | Uso |
|---|---|
| `uuid` | Clave de idempotencia. Va a `games.chesscom_uuid`. |
| `url` | Link a la partida en chess.com. |
| `pgn` | PGN completo con headers y comentarios `%clk`. Se guarda crudo. |
| `time_control` | Formato PGN, ej `900+10` o `600`. En correspondencia es `1/86400` (segundos por jugada), que hay que parsear aparte o la ingesta revienta. |
| `time_class` | `rapid`, `blitz`, `bullet`, `daily`. |
| `rules` | `chess`, `chess960`, `bughouse`, `threecheck`... **Filtrar `chess`.** Ojo: las partidas por correspondencia también son `rules: 'chess'`; se ingieren pero se marcan `analysis_state = 'skipped'`. |
| `end_time` | Epoch en segundos, UTC. |
| `accuracies` | `{ white, black }` cuando chess.com ya la calculó. No siempre viene. **Guardar la de Gabriel en `games.my_accuracy`**: es el único control externo que tiene el analizador. |
| `eco` | **URL** a la apertura (no el código). Va a `games.opening_url_cc`. El código de 3 letras para `opening_eco_cc` sale del header `[ECO]` del PGN. **Demasiado grueso igual, ver más abajo.** |
| `fen` | Posición final. |
| `white` / `black` | `{ username, rating, result, uuid, @id }`. |

### El campo `result`, no el header `Termination`

`white.result` y `black.result` son un enum estable:

```
win, checkmated, agreed, repetition, timeout, resigned, stalemate,
lose, insufficient, 50move, abandoned, kingofthehill, threecheck,
timevsinsufficient, bughousepartnerlose
```

El header `Termination` del PGN es prosa en inglés que varía de formato. Usar siempre el enum
del JSON y guardarlo en `games.termination`.

Para saber de qué color jugó Gabriel: comparar `white.username` con su usuario, sin distinguir
mayúsculas. chess.com devuelve el usuario con la capitalización que la persona eligió.

### Ingesta incremental

El histórico completo se baja una vez. Después, el cron diario refresca **solo el mes actual y
el anterior** (el anterior por si una partida quedó registrada cruzando la medianoche de fin de
mes). Upsert por `chesscom_uuid`.

### Cálculo de sesión, en la ingesta

Después de insertar, recalcular con una window function sobre `end_time`: dos partidas
consecutivas pertenecen a la misma sesión si el hueco entre ellas es menor a **40 minutos**.

```sql
with marked as (
  select id, end_time,
    case when end_time - lag(end_time) over (order by end_time) > interval '40 minutes'
         or lag(end_time) over (order by end_time) is null
    then 1 else 0 end as is_new_session
  from games where rules = 'chess'
),
sessions as (
  select id, sum(is_new_session) over (order by end_time) as session_id from marked
)
update games g set session_id = s.session_id from sessions s where g.id = s.id;
```

Después, `game_in_session` es `row_number() over (partition by session_id order by end_time)` y
`prev_result` es `lag(result) over (partition by session_id order by end_time)`.

Esta única sentencia desbloquea tres de los análisis más accionables del proyecto (fatiga,
tilt, y largo de sesión contra rendimiento) y no necesita motor.

---

## 2. Aperturas de Lichess

Repositorio: `lichess-org/chess-openings`. Archivos `a.tsv` a `e.tsv`, dominio público, unas
3.500 líneas en total. Cada fila trae ECO, nombre y la línea en PGN.

### Por qué no usar el ECO de chess.com

`C44` agrupa el Ponziani con el Gambito Escocés y el Gambito Göring, entre otras líneas. (La
Escocesa propiamente tal, 3.d4 exd4 4.Cxd4, es C45.) Gabriel juega Ponziani. Si la pregunta
"contra qué apertura pierdo" se agrupa por el ECO de chess.com, su repertorio real queda
mezclado con dos gambitos que no juega, y la respuesta no sirve para decidir qué estudiar.

### Cómo resolver la apertura

1. En la carga inicial: para cada fila del TSV, reproducir su PGN con `chess.js` y guardar los
   **primeros cuatro campos de `fen()`** como EPD (chess.js no expone `epd()`). El `id` es un
   slug determinista `eco || '_' || slug(name)`, generado por una única función del loader.
   Las transposiciones colisionan en `epd`, que es UNIQUE: usar `on conflict (epd) do nothing`
   ordenando por `ply_count` ascendente, para quedarse con la línea más corta.
2. Al ingerir una partida: reproducirla jugada a jugada, calcular el EPD en cada posición, y
   buscar coincidencias en `openings.epd`. **Quedarse con el match más profundo** (el de mayor
   `ply_count`). Ese es `games.opening_id`.
3. Los plies hasta ese punto son jugadas de libro: se marcan `moves.is_book = true` y se
   excluyen de las tasas de error.

El ECO de chess.com se guarda igual en `opening_eco_cc` y `opening_url_cc`, para poder medir
cuánto discrepan las dos clasificaciones.

---

## 3. Parseo del PGN

Dos librerías, cada una con un trabajo distinto. Ninguna hace las dos cosas bien.

- **`@mliebelt/pgn-parser`**: gramática PEG real. Extrae headers, movetext, NAGs, variantes y
  comentarios estructurados según el PGN Supplement, incluido `%clk`, ya tipados. **No valida
  legalidad.**
- **`chess.js` v1.x**: valida legalidad, reproduce SAN, entrega FEN y UCI vía
  `history({ verbose: true })`. Su manejo de comentarios es incómodo: `getComments()` devuelve
  `{fen, comment}[]` y habría que sacar el `%clk` con regex y volver a unir por FEN.

**Patrón correcto:** `pgn-parser` para headers, jugadas y relojes, y reproducir la secuencia SAN
por `chess.js` para validar y obtener FEN y UCI. Son unas 20 líneas. Cualquier discrepancia
entre las dos librerías es señal de que esa partida tiene algo raro y conviene marcarla en vez
de ignorarla.

**Dónde va el try/catch.** En chess.js 1.x, `loadPgn()`, `move()` y el propio constructor
`Chess()` **lanzan excepciones** en vez de devolver null, y los métodos pasaron a camelCase
(`load_pgn` a `loadPgn`, `game_over` a `isGameOver`), con `header()` deprecado a favor de
`getHeaders`/`setHeader`. Buena parte de los tutoriales en línea son anteriores a la 1.0.

Como el patrón de arriba **no llama a `loadPgn`** (reproduce SAN jugada a jugada), el try/catch
va alrededor del bucle de `chess.move()`, que es el que lanza. Una partida que falla se marca
`analysis_state = 'failed'` y no detiene la corrida.

Fijar versiones exactas en `package.json`. "v1.x" no es una restricción suficiente.

### Headers útiles del PGN de chess.com

`UTCDate`, `UTCTime`, `ECO`, `ECOUrl`, `TimeControl`, `Termination`, `Link`, `WhiteElo`,
`BlackElo`, `CurrentPosition`.

`UTCDate` y `UTCTime` están en UTC. **Cualquier análisis por hora del día en UTC es inútil**:
desplaza todo cuatro horas contra la realidad de Santiago. Guardar `timestamptz` y convertir
con `at time zone 'America/Santiago'` en las vistas.

### El cálculo del reloj

Cada jugada trae un comentario `{[%clk 0:14:52.3]}` con el tiempo **restante después** de esa
jugada.

```
tiempo_usado(ply n) = clock_ms(ply n-2) - clock_ms(ply n) + incremento_ms
```

Se diferencia contra el ply **n menos 2**, que es la jugada anterior del mismo jugador. Los
relojes de blancas y negras se intercalan en el PGN.

Sin sumar el incremento, una jugada instantánea en 15+10 da tiempo negativo, porque el reloj
sube. Son justo las jugadas rápidas, que son las que se quieren correlacionar con los errores.

Casos borde:

- **Plies 1 y 2**: no hay `%clk` previo, pero el reloj previo sí se conoce: es
  `games.base_seconds`. Incluirlos importa, porque son parte del "porcentaje de jugadas bajo 3
  segundos" en la apertura, y sin ellos la suma de tiempos no cuadra contra el control de tiempo.
- **Truncamiento a decisegundos**: `%clk` viene con una cifra decimal, así que una jugada
  instantánea con incremento puede dar hasta -100 ms legítimamente. Clampear a 0, no tratarlo
  como error.
- **Correspondencia**: no trae `%clk`. `clock_ms` es nullable.
