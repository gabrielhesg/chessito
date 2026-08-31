# Especificación del análisis con motor

## Qué es Stockfish y qué hace acá

Stockfish es el motor de ajedrez open source más fuerte que existe. Recibe una posición y
devuelve dos cosas: la mejor jugada, y una evaluación numérica en **centipeones** (100 = un
peón de ventaja). Es lo que está detrás del botón "Analizar" de chess.com y de Lichess.

Se usa acá porque sin motor la app solo puede contar lo que el jugador declara. Con motor mide
lo que realmente ocurrió: para afirmar que colgó una pieza en la jugada 23, alguien tiene que
evaluar la posición antes y después y comparar la caída.

Se comunica por **protocolo UCI** sobre stdin/stdout. No hace falta ninguna librería: se levanta
el binario como proceso hijo y se le escriben comandos de texto.

## Dónde corre

**En GitHub Actions**, con un workflow programado que instala Stockfish nativo con `apt` y corre
el analizador contra Supabase. Gratis, sin computador propio encendido, y disparable a mano desde
el celular.

El mismo script corre igual en un computador con `pnpm analyze` si algún día quieres que sea más
rápido. La única diferencia es dónde se ejecuta y de dónde salen las credenciales.

Supuestos del cálculo: 800.000 nodos por posición y unas 70 posiciones analizadas por partida
después de descartar jugadas de libro. Son 56 millones de nodos por partida.

| Dónde | Nodos por segundo | Segundos por partida | 800 partidas |
|---|---|---|---|
| WASM en navegador, 1 hilo | ~1,5 M | ~37 | ~8 horas |
| **Runner de GitHub Actions (2 a 4 núcleos)** | **~4 M** | **~14** | **~3 horas** |
| Nativo en un PC de escritorio, 8 hilos | ~15 M | ~4 | ~50 minutos |

Los nps son estimaciones de orden de magnitud, no promesas.

### Por qué GitHub Actions alcanza de sobra

El plan gratuito de GitHub da **2.000 minutos al mes** en repositorios privados, e ilimitado en
repositorios públicos, con runners estándar. El backfill completo del histórico son unas 3 horas
repartidas en varias corridas, es decir unos 180 minutos **una sola vez**. Después, mantener al
día unas 30 partidas nuevas al mes son 7 minutos mensuales.

Cada job tiene un tope de 6 horas, así que el backfill se hace por lotes: el workflow toma un
lote, lo analiza y termina. Volver a dispararlo continúa donde quedó, porque la máquina de
estados de `analysis_state` ya está diseñada para eso.

### Descartes explícitos

- **Supabase Edge Functions**: dos bloqueos. Un isolate de Deno no puede lanzar un binario
  nativo, así que solo cabría WASM; y hay un tope duro de **2 segundos de CPU por invocación**
  contra los ~14 segundos que toma una partida. Inviable, no es cosa de optimizar.
- **Vercel Functions**: con Fluid compute el máximo son 300 segundos y el cron del plan Hobby
  dispara una sola vez al día. Sirve para la ingesta, que son segundos, no para el análisis.
- **Navegador como caballo de batalla**: exige la pestaña abierta durante horas, las pestañas en
  segundo plano se estrangulan, y en móvil no corre. Queda como extra opcional para analizar una
  partida puntual (Fase 3.5).

## Configuración del motor

```
setoption name Threads value <ver nota>
setoption name Hash value 256
```

NNUE viene activado por defecto en Stockfish moderno.

### Sobre `Threads` y la reproducibilidad

Con más de un hilo, `go nodes` **no es bit a bit reproducible**: el entrelazado de hilos cambia
qué nodos se visitan y el corte por nodos se pasa un poco según la granularidad de chequeo de
cada hilo. Dos corridas de la misma posición pueden dar evaluaciones levemente distintas.

- Si te importa poder reproducir exactamente una evaluación: `Threads 1`. Cuesta unas 4 veces
  más tiempo de pared.
- Si te importa el rendimiento agregado, que es el caso de esta app: `Threads = núcleos - 1`.
  Las diferencias entre corridas son de unos pocos centipeones y no mueven las clasificaciones,
  que operan sobre caídas de 10 puntos de probabilidad o más.

Elegir uno y dejarlo escrito en `ENGINE_ID`.

### Presupuesto fijo de nodos, no de tiempo ni de profundidad

```
go nodes 800000
```

- **Tiempo fijo** hace que el resultado dependa de la carga de la máquina. Dos corridas de la
  misma partida dan números muy distintos y dejan de ser comparables.
- **Profundidad fija** explota en posiciones tácticas: profundidad 20 en un final tranquilo son
  100 milisegundos, en un medio juego agudo pueden ser 30 segundos.
- **Nodos fijos es estable y comparable en agregado.** 800.000 nodos aterriza alrededor de
  profundidad 17 a 21 según la posición.

800.000 nodos sobra para un jugador de 1200 a 1600. Los errores a ese nivel son colgar un
caballo, permitir una horquilla, no ver mate en dos: todo visible en profundidad 12. Analizar a
profundidad 25 cuesta diez veces más y encuentra errores que el jugador no podía evitar y que
no debería estar estudiando.

`ENGINE_ID` no se hardcodea: se construye al arrancar leyendo el `id name` que devuelve el motor
al comando `uci`, concatenado con el presupuesto y el número de hilos. Por ejemplo
`sf16-800k-t7`. El `apt install stockfish` de Debian estable trae una versión bastante más vieja
que el `brew` de macOS, y hay que poder distinguirlas. Al cambiar de motor o de presupuesto las
evaluaciones dejan de ser comparables: se re encolan selectivamente en vez de mezclar dos
motores en la misma tabla.

## Una evaluación por posición, no dos

Para una partida de N jugadas hay N+1 posiciones. Se evalúa cada posición **una vez**. La
pérdida de una jugada es el delta entre la evaluación de la posición anterior y la siguiente.

Evaluar "la posición" y luego "la posición después de mi jugada" por separado duplica el
trabajo sin agregar información.

## Los DOS pasos de signo. Ambos son obligatorios.

Este es el punto donde más proyectos caseros producen resultados invertidos en silencio.

### Paso 1: normalizar la evaluación a blancas

`score cp` de UCI viene **desde la perspectiva del que mueve**. En un ply donde mueven negras,
un `+150` significa que **negras** están mejor.

Al escribir en `moves.eval_cp`, negar en los plies donde mueve negras, de modo que la columna
quede siempre en perspectiva de blancas.

```
eval_cp = (mueve_blancas) ? score_cp : -score_cp
```

### Paso 2: volver a girar el delta según quién movió

`eval_cp` ya está en perspectiva de blancas. Por lo tanto, cuando **negras** juegan una mala
jugada, la evaluación **sube**. Si se calcula la pérdida como `wp_antes - wp_despues` sin
distinguir, todas las jugadas de negras dan pérdida negativa, todas caen en
`classification = 0`, y **los errores de Gabriel con negras desaparecen del análisis**.

```
wp_antes   = win_pct(eval_cp de la posición antes de la jugada)
wp_despues = win_pct(eval_cp de la posición después de la jugada)

perdida = movio_blancas ? (wp_antes - wp_despues) : (wp_despues - wp_antes)
win_pct_loss = max(0, perdida)
```

Lo mismo para `cp_loss`, que la columna documenta como "desde la perspectiva del que movió,
mayor o igual a cero":

```
cp_loss = max(0, movio_blancas ? (eval_antes - eval_despues) : (eval_despues - eval_antes))
```

**Test unitario obligatorio.** Tomar una posición donde negras tienen ventaja clara, hacer que
negras jueguen una jugada que cuelga la dama, y verificar que `win_pct_loss` sale grande y
positivo. Si sale negativo o cero, el paso 2 está mal. Escribir el test simétrico para blancas.

### Puntuaciones de mate

`score mate N` no es un centipeón. Mapear `mate_in > 0` a cp 10000 y `mate_in < 0` a cp menos
10000. Ojo con el clamp de más menos 1000 de `win_pct`: un mate no da 100% sino 97,5%, que es
el techo de la función. Eso es correcto y deseado, porque igual dispara `is_decided`.

"Mate en 3 se convierte en mate en 5" es pérdida cero, no un desplome: si antes y después hay
mate para el mismo bando, la pérdida es cero por definición.

## Clasificación: por caída de probabilidad de victoria

### Conversión de centipeones a win%

Fórmula de Lichess:

```
win_pct(cp) = 50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
```

Clampear `cp` a más menos 1000 antes de convertir. Ya está implementada como función SQL
`win_pct(int)` en la migración. Valores de referencia, verificados corriendo la función contra
Postgres 16:

| cp | win% |
|---|---|
| -1000 | 2,5 |
| -300 | 24,9 |
| -100 | 40,9 |
| 0 | 50,0 |
| +100 | 59,1 |
| +300 | 75,1 |
| +900 | 96,5 |

### Umbrales

| Clasificación | Caída de win% | `classification` |
|---|---|---|
| Correcta | menor a 10 | 0 |
| Imprecisión | 10 o más | 1 |
| Error | 20 o más | 2 |
| Error grave | 30 o más | 3 |

**Quién escribe la columna:** el analizador. `moves.classification` se calcula en el script a
partir de `win_pct_loss` y se escribe junto con el resto de la fila. La regla del proyecto de
"nada de agregaciones en TypeScript" aplica a agregaciones entre filas, no a derivaciones fila
a fila como esta.

### Por qué no clasificar por centipeones

La convención de centipeones (imprecisión 50, error 100, error grave 300) es la que usa la
mayoría de las herramientas caseras y es **incorrecta justo donde más importa** para un
jugador de este nivel. Los números salen de la propia función SQL de este proyecto:

| Caso | Caída en centipeones | Caída en win% |
|---|---|---|
| De +900 a +500 | 400 (sería "error grave") | **10,2** (apenas una imprecisión) |
| De +30 a -120 | 150 (sería "error") | **13,6** (peor que el anterior) |

El primero es una posición ganada que sigue ganada. El segundo es una posición igualada que se
volvió perdida. La convención de centipeones los ordena al revés.

Guardar `cp_loss` igual, es gratis y sirve para calcular ACPL. Pero clasificar por
`win_pct_loss`.

## Qué se excluye de las tasas de error

**`is_book = true`**: los plies dentro de la línea de apertura reconocida. Se calcula sin motor,
comparando el ply contra `openings.ply_count` de la apertura resuelta por EPD, así que se
puebla en la Fase 2 y no en la Fase 3. Si no se excluyen, las jugadas de teoría que al motor no le gustan
contaminan la tasa de blunders.

**`is_decided = true`**: posiciones donde el win% **antes** de la jugada, desde la perspectiva
del que mueve, ya era mayor a 95 o menor a 5. Jugar flojo en una partida ya ganada no es lo que
lo tiene en 1243, e incluirlo hace que "blunders por partida" se mueva por razones equivocadas.

## `divergence_ply`: la métrica más accionable del proyecto

Definición, **en la perspectiva de Gabriel, no la de blancas**:

Sea `eval_mia = (Gabriel juega blancas) ? eval_cp : -eval_cp`.

`divergence_ply` es el primer ply donde `eval_mia` cae bajo **menos 100** centipeones y **no
vuelve a subir sobre menos 50** en el resto de la partida. Si nunca ocurre, queda NULL.

Esta distinción importa: `eval_cp` está normalizado a blancas, así que en sus partidas con
negras la condición sobre la columna cruda sería `eval_cp > +100`. Calcularlo sobre la columna
cruda sin girar da resultados sin sentido en la mitad de las partidas.

Después, esto responde literalmente "en qué jugada se me empieza a torcer esta apertura":

```sql
select opening_name, my_color, n, n_diverged, median_divergence_ply
from v_opening_performance
where n >= 20 and n_diverged >= 10
order by median_divergence_ply;
```

Ojo con el denominador: la mediana se calcula solo sobre las partidas que divergieron, así que
el filtro tiene que mirar `n_diverged`, no `n`. Una apertura con 40 partidas y 3 divergencias
no tiene una mediana confiable.

## Máquina de estados del analizador

```
pending  --(el worker la toma)-->  claimed
claimed  --(análisis completo)-->  done
claimed  --(excepción)---------->  failed
claimed  --(reclamada hace > 30 min)--> pending    (recuperación de huérfanas)
```

`skipped` es para lo que nunca se va a analizar: partidas por correspondencia (sin `%clk` y sin
sentido táctico comparable) y cualquier cosa que no sea `rules = 'chess'` que se haya colado.

- El worker reclama un lote pequeño (5 a 10 partidas) con `update ... returning` para evitar
  doble trabajo.
- **Una transacción por partida**: todas las filas de `moves` de esa partida más el `update` a
  `games` se confirman juntos. Si se corta la corrida, no quedan partidas a medio analizar.
- Orden de backfill: rápida y blitz primero, **de la más reciente hacia atrás**.
- Una partida que falla se marca `failed` y no mata la corrida.

### Columnas que el analizador debe escribir

En `moves`: `eval_cp`, `mate_in`, `best_uci`, `cp_loss`, `win_pct_loss`, `classification`,
`is_decided`.

En `games`: `analysis_state`, `analyzed_at`, `engine_id`, `divergence_ply`, `acpl`, `blunders`,
`mistakes`, `inaccuracies`. Los cuatro últimos se cuentan **solo sobre jugadas propias, no de
libro y no decididas**, para que concuerden con las vistas.

## Credenciales del analizador

**Conexión directa a Postgres** con `SUPABASE_DB_URL`. El script necesita reclamar lotes con
`update ... returning`, escribir cientos de filas por partida y confirmar transacciones; una
ruta HTTP por partida obligaría a inventar endpoints de reclamo y liberación para nada.

En GitHub Actions la variable viene de un **repository secret** llamado `SUPABASE_DB_URL`. En
local, de `.env.local`. El script lee `process.env` y no le importa de dónde salió.

No se expone ninguna ruta HTTP de análisis.

## El workflow de GitHub Actions

`.github/workflows/analyze.yml`:

- Se dispara por `schedule` (una vez al día) y por `workflow_dispatch`, que es el botón "Run
  workflow" que permite lanzarlo a mano desde el celular con la app de GitHub.
- Instala Stockfish con `sudo apt-get install -y stockfish`. El binario queda en
  `/usr/games/stockfish`.
- Define `ENGINE_THREADS` según `nproc`, menos uno.
- Corre `pnpm analyze` con un tope de lote configurable por input del `workflow_dispatch`, para
  poder hacer el backfill en tandas sin chocar con el límite de 6 horas por job.
- `timeout-minutes` puesto en algo conservador, como 330.

## Verificación de aceptación de la Fase 3

El campo `accuracies` de chess.com es un puntaje de 0 a 100 con fórmula no publicada, y el ACPL
son centipeones donde menos es mejor. **No son la misma unidad y no se pueden restar.** La
comparación que sí se puede correr es de correlación de rangos:

```sql
select corr(g.acpl, g.my_accuracy) as pearson,
       count(*) as n
from games g
where g.analysis_state = 'done' and g.my_accuracy is not null;
```

Se espera una correlación **claramente negativa**, del orden de -0,6 o más fuerte: más ACPL,
menos accuracy. Si sale cerca de cero o positiva, hay un error de signo en alguno de los dos
pasos de la sección de signos.

Para que esto sea posible, la ingesta de la Fase 1 tiene que **guardar `accuracies` en
`games.my_accuracy`** cuando chess.com lo trae. Sin eso, la columna queda NULL y el test no se
puede correr.

## Fase 4: filtro de calidad de los ejercicios

Antes de convertir un error grave en ejercicio, correr una pasada con `MultiPV = 2`
**solamente sobre las posiciones candidatas**. Si la segunda mejor jugada es casi tan buena
como la primera (menos de 10 puntos de win% de diferencia), marcar `is_unique = false` y no
servir esa posición.

Sin este filtro el entrenador marca como error una jugada ganadora distinta a la del motor. Es
la razón número uno por la que la gente abandona los entrenadores caseros en la primera semana.
