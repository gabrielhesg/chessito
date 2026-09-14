# Chessito

App personal de análisis de ajedrez. Ingiere las partidas de Gabriel desde la API pública de
chess.com y responde cuatro preguntas que la plataforma no entrega gratis.

**Usuario único.** No hay multi tenancy, no hay onboarding, no hay landing. Gabriel es el
único que entra. Cualquier decisión de diseño que asuma más de un usuario está mal.

## Las cuatro preguntas que la app existe para responder

| # | Pregunta | Página | Milestone |
|---|---|---|---|
| 1 | Contra qué aperturas pierde, con qué color, y en qué jugada cae la evaluación | `/aperturas` | Fase 1, se completa en Fase 3 |
| 2 | Tilt y fatiga: hora del día, número de partida en la sesión, qué pasa tras una derrota | `/ritmo` | Fase 1 |
| 3 | Blunders reales: clasificación de cada jugada, tasa por partida y por fase | `/errores` | Fase 3 |
| 4 | Uso del reloj: dónde piensa, y si los errores se concentran en jugadas rápidas | `/reloj` | Fase 2, se completa en Fase 3 |

Y una pantalla que no responde una pregunta de ajedrez pero sostiene la confianza en todas:
`/salud`, con el estado de la ingesta, los chequeos de calidad de datos y las últimas corridas.
Sin ella, todo lo demás son números que hay que creer a ciegas.

Objetivo final (Fase 4): un entrenador que le sirva sus propias posiciones perdidas como ejercicios,
en `/entrenador`.

## Estándares de ingeniería

Cuatro documentos son **criterio de aceptación, no sugerencias**:

| Documento | Qué define |
|---|---|
| `docs/ENGINEERING.md` | Tipado, tests, CI, manejo de errores, seguridad |
| `docs/ENVIRONMENTS.md` | Ramas, dev y prod, secretos por ambiente |
| `docs/CONFIANZA.md` | Cómo se verifica que el análisis es correcto |
| `docs/ANALYSIS-SPEC.md` | El motor, las fórmulas y los umbrales |
| `docs/DECISIONES-DE-STACK.md` | Por qué cada pieza, y cuál es el camino de salida |
| `docs/DESPLIEGUE.md` | Los pasos manuales: Supabase, Vercel y GitHub, pantalla por pantalla |

En resumen: TypeScript strict sin
`any`, tipos de base de datos generados, validación con Zod en el borde, tests con Vitest sobre
fixtures reales, CI en cada push, migraciones que nunca se editan hacia atrás, y cero catch
vacíos. Una fase con el CI en rojo no está terminada. Leerlo antes de escribir código.

## Stack

- Next.js App Router, TypeScript, Tailwind, en Vercel (plan Hobby)
- Postgres en Supabase (plan gratis)
- Stockfish nativo, corriendo en **GitHub Actions** (workflow programado, gratis)
- `chess.js` y `@mliebelt/pgn-parser` para PGN, con **versiones exactas fijadas** en package.json
- Zona horaria de referencia: `America/Santiago`, hardcodeada en las vistas SQL. Es el único usuario.

## Reglas del proyecto

**El motor corre en GitHub Actions**, en un workflow programado que baja el binario oficial de
Stockfish desde sus releases de GitHub y se conecta directo a Postgres. Todo el proyecto vive en
la nube: Gabriel trabaja desde su celular o desde cualquier computador y no necesita tener nada
encendido.

No corre en Vercel (300 s de tope, cron una vez al día), ni en Supabase (2 s de CPU por
invocación y un isolate de Deno no puede lanzar un binario), ni en el navegador (10 veces más
lento y exige pestaña abierta durante horas). Razones y números en `docs/ANALYSIS-SPEC.md`.

El mismo script `pnpm analyze` corre igual en un computador si se quiere ir más rápido. Lee sus
credenciales de `process.env` y no le importa si vienen de un secret de GitHub o de `.env.local`.

**Todo lo programado vive en GitHub Actions, no en Vercel.** El plan gratuito de Vercel permite
un solo cron al día; GitHub Actions permite hasta cada 5 minutos. La ingesta corre cada 3 horas
en Actions, con el cron diario de Vercel como piso garantizado (Actions desactiva los workflows
programados tras 60 días sin actividad en el repo, y Vercel no). La ingesta es idempotente, así
que estar en dos programadores no duplica nada.

**El esquema es PostgreSQL estándar, sin nada propietario de Supabase.** Es deliberado: las dos
migraciones corren tal cual en cualquier Postgres y fueron verificadas contra un PostgreSQL 16
común. Lo único atado a Supabase es la autenticación y el almacenamiento, aislados en
`lib/supabase/`. No introducir dependencias de Supabase en el SQL.

**Postgres es caché, no fuente de verdad.** chess.com es la fuente. La ingesta es idempotente
por `chesscom_uuid`. El PGN crudo se guarda en cada fila de `games`, así que todo lo derivado
se puede reconstruir. Lo único irrecuperable son las evaluaciones del motor y el historial del
entrenador, y por eso la Fase 3 incluye el respaldo NDJSON a Supabase Storage.

**Toda vista agregada expone su `n`. El umbral es 20.** Cualquier corte con `n < 20` se muestra
atenuado y sin recomendación asociada. Un split de tilt calculado sobre 12 partidas es ruido, y
presentarlo como hallazgo es la forma más rápida de que la app pierda credibilidad.

**El número principal de la portada es "partidas de rápida este mes", no la tasa de blunders.**
El riesgo real de este proyecto es que construir la app reemplace a jugar ajedrez. La portada
tiene que empujar a jugar. Sale de la vista `v_monthly_activity`.

**Las agregaciones entre filas viven en vistas SQL, no en TypeScript.** Si una página necesita
una métrica nueva, primero se agrega la vista a `supabase/migrations/`. Las derivaciones fila a
fila (clasificar una jugada, calcular el tiempo de una jugada) sí van en el script que escribe
esa fila.

**Ninguna variable lleva `NEXT_PUBLIC_`.** La app no tiene un solo componente cliente, así que
ningún valor necesita viajar al navegador, ni siquiera la URL y la anon key de Supabase: se
llaman `SUPABASE_URL` y `SUPABASE_ANON_KEY` a secas (los nombres con prefijo se siguen aceptando
como respaldo, ver `lib/env.ts`). Vercel además se niega a guardar como secreto una variable con
ese prefijo, porque el prefijo significa lo contrario.

Y la service role key menos que ninguna: el cliente admin vive en `lib/supabase/admin.ts` y su
primera línea es `import 'server-only'`, para que el build falle si alguien lo importa desde un
componente cliente.

**Versionar el análisis.** `games.engine_id` se construye al arrancar el analizador leyendo el
`id name` que devuelve el motor, más el presupuesto de nodos y el número de hilos. No se
hardcodea: el `apt install stockfish` de Debian trae una versión bastante más vieja que el
`brew` de macOS y hay que poder distinguirlas.

## Trampas conocidas. Leer antes de escribir código.

### 1. El incremento en `%clk`

El tiempo usado en una jugada es:

```
tiempo_usado = reloj_previo_del_mismo_jugador - reloj_actual + incremento
```

Tres errores clásicos:

- **Olvidar el incremento.** En 15+10 una jugada instantánea hace que el reloj **suba** unos 10
  segundos, así que `prev - actual` da negativo justo en las jugadas rápidas, que son las que se
  quieren correlacionar con los blunders.
- **Diferenciar contra el ply anterior** en vez de contra el ply n menos 2. Los relojes de
  blancas y negras se intercalan en el PGN.
- **Descartar los plies 1 y 2.** No tienen `%clk` previo, pero el reloj previo sí se conoce: es
  `games.base_seconds`. Son parte del porcentaje de jugadas rápidas en la apertura, y sin ellos
  la suma de tiempos no cuadra contra el control de tiempo declarado.

`%clk` viene truncado a decisegundos, así que un resultado de hasta -100 ms es legítimo:
clampear a 0, no tratarlo como error. Las partidas por correspondencia no traen `%clk` y ahí sí
`clock_ms` queda NULL.

### 2. El signo de la evaluación. Son DOS pasos, no uno.

`score cp` de UCI viene desde la perspectiva del que mueve, así que hay que normalizar a blancas
al escribir `moves.eval_cp`. **Pero eso es solo la mitad.** Como `eval_cp` queda en perspectiva
de blancas, una mala jugada de negras hace **subir** la evaluación. Si la pérdida se calcula
como `antes - después` sin distinguir quién movió, todos los errores de Gabriel con negras
desaparecen del análisis en silencio.

La fórmula completa y el test unitario obligatorio están en `docs/ANALYSIS-SPEC.md`, sección
"Los DOS pasos de signo". No escribir el analizador sin leerla.

Lo mismo aplica a `divergence_ply`: se calcula sobre la evaluación girada a la perspectiva de
Gabriel, no sobre la columna cruda.

### 3. El ECO de chess.com es demasiado grueso

`C44` agrupa el Ponziani con el Gambito Escocés y el Gambito Göring. Gabriel juega Ponziani, así
que agrupar por el ECO de chess.com mezclaría su repertorio real con dos gambitos que no juega,
y la pregunta 1 quedaría inservible.

Solución: empaquetar los TSV de aperturas de Lichess en la tabla `openings` y resolver por EPD,
quedándose con el match más profundo. Detalle en `docs/DATA-SOURCES.md`.

Como la resolución por EPD es código nuevo, `v_opening_performance` usa LEFT JOIN y las partidas
sin resolver aparecen agrupadas como "Sin resolver". Si ese grupo crece, hay un bug en el
loader, y con INNER JOIN sería invisible.

### 4. chess.js 1.x rompió su API

`loadPgn` reemplaza a `load_pgn`, los métodos pasaron a camelCase, `header()` quedó deprecado a
favor de `getHeaders`/`setHeader`, y `loadPgn()`, `move()` y el constructor `Chess()` ahora
**lanzan** en vez de devolver null.

Ojo con dónde va el try/catch: el patrón de parseo de este proyecto **no llama a `loadPgn`**,
reproduce SAN jugada a jugada. El try/catch va alrededor del bucle de `chess.move()`.

### 5. Correspondencia y variantes

`rules = 'chess'` no basta como filtro. Las partidas por correspondencia también son
`rules: 'chess'`, tienen `time_control` con formato `1/86400` (que revienta el parser de
`900+10`). Se ingieren, pero se marcan `analysis_state = 'skipped'` y quedan fuera del análisis
de reloj y de motor.

**Corrección medida en el histórico real (Fase 1).** Dos cosas del párrafo anterior no eran
exactas y el código sigue lo medido, no lo escrito:

- La correspondencia **sí trae `%clk`**. Las que no lo traen son las partidas *Play vs Coach*,
  que además llegan con `time_control = '-'` (`parseTimeControl` lo trata como correspondencia y
  las marca `skipped`). En 9.650 partidas hay 4 partidas `daily`: una de correspondencia real y
  tres contra el coach.
- El resto del histórico es 100% `rules: 'chess'`. Todavía no hay una sola variante, así que el
  camino de variantes está escrito pero nunca se ejerció con datos de verdad.

## Estado al terminar la Fase 1

La app está construida y verificada de punta a punta contra el histórico real (9.650 partidas,
23 meses, desde 2024-10). Lo que existe hoy:

| Pieza | Dónde |
|---|---|
| Lógica de ajedrez, pura y testeada | `lib/chess/` (slug, openings, pgn, clock, timecontrol, chesscom, game) |
| La única función de ingesta | `lib/ingest/run.ts` |
| Acceso a datos | `lib/ingest/store.ts` (interfaz) con dos transportes: `supabase-store.ts` y `pg-store.ts` |
| Lecturas de la app | `lib/data.ts`, todas con los tipos generados |
| Páginas | `/`, `/aperturas`, `/ritmo`, `/registro`, `/salud`, `/entrar` |
| Migraciones nuevas | `0003_session_features.sql`, `0004_portada_y_reconciliacion.sql` y `0005_vistas_sin_definer.sql` |

**Dos transportes, una sola lógica.** `SupabaseIngestStore` (PostgREST + service role) es el que
corre en Vercel; `PgIngestStore` (conexión directa por `SUPABASE_DB_URL`) es el de los scripts y
GitHub Actions, porque mueve miles de filas y cuesta una fracción. Los dos hablan con el mismo
esquema y llaman a la misma función SQL `recompute_session_features()`. Si agregas una operación
de datos, va en la interfaz y en las dos implementaciones, nunca en una sola.

**`lib/env.ts` valida perezosamente, no al importar.** Si validara al importar, `next build` se
caería en CI, donde no hay secretos. Los scripts batch llaman a `assertEnv()` en su primera línea
y conservan el "falla al arrancar con el nombre de la variable que falta".

**Los scripts corren con `--conditions=react-server`.** Es lo que hace que `import 'server-only'`
no explote fuera de Next. Está en los scripts de `package.json`; si agregas uno nuevo, cópialo.

**La reconciliación compara UUID a UUID, no conteos mensuales.** El plan original de
`docs/CONFIANZA.md` (comparar contra `v_games_by_month`) no puede funcionar: los archivos
mensuales de chess.com están cortados por el **inicio** de la partida y `games.end_time` es el
final, así que cualquier vista agrupada por mes descuadra en cada frontera. Medido en el
histórico completo: doce meses con diferencias que se cancelan de a pares (-8/+8, -15/+15). La
ingesta pide los uuid de cada archivo y verifica cuáles quedaron guardados; así no solo sabe que
falta una partida, sabe cuál, y lo deja en `job_runs.detail`. El razonamiento está escrito en la
migración 0003.

**Los ids de `openings` llevan sufijo cuando hace falta.** `eco + '_' + slug(name)` no es único
en los TSV de Lichess: 253 pares (eco, nombre) aparecen en varias líneas con EPD distinto. La
línea más corta se queda el id limpio y las demás llevan seis hex del EPD
(`assignOpeningIds` en `lib/chess/openings.ts`). Sin eso se perdían 253 EPD y con ellos parte de
la resolución por transposición.

**Las vistas que agregó la Fase 1.** `v_monthly_summary` (el mes en curso ya agregado, para que
la portada no sume filas en TypeScript), `v_monthly_activity_wilson` (lo mismo que
`v_monthly_activity` pero con `n` y `wilson_lower`, porque la original expone el porcentaje
pelado y la regla es usar Wilson) y `v_opening_resolution` (cuántas partidas quedan sin resolver
por EPD, que es el numerador del chequeo `aperturas_sin_resolver`). Las originales de 0001 y 0002
quedan intactas: nunca se edita una migración aplicada.

**Las vistas corren con `security_invoker = on`.** Lo agrego la migracion 0005, y es una regla
para toda vista nueva. Una vista creada por `postgres` se ejecuta con los permisos de quien la
definio, asi que se salta el RLS de las tablas que lee; como Supabase le da SELECT sobre
`public` a `anon` por omision, las quince vistas eran legibles con la anon key, que viaja al
navegador. Medido en la base real: el mismo `count(*)` daba 9.650 filas con el rol anon antes
del arreglo y 0 despues. Si agregas una vista, va con `security_invoker`.

**Lo que la Fase 2 necesita saber.** `lib/chess/clock.ts` ya existe, está testeado contra
fixtures reales y resuelve la trampa 1 completa (incremento, ply n-2, plies 1 y 2 contra
`base_seconds`, clampeo del truncamiento a decisegundos). `parsePgn` ya devuelve `ply`, `san`,
`uci`, `clockMs` y el EPD de cada posición. Escribir `moves` es recorrer eso y calcular `phase` e
`is_book` (el `plyCount` del match de apertura ya sale de `resolveOpening`).

**Medido en la Fase 1, para no volver a medirlo:** el histórico completo son ~9.650 partidas;
`pnpm ingest --full` demora ~2 minutos; `pnpm openings:load` carga 3.810 filas; la resolución de
apertura por EPD deja 0,01% sin resolver; las consultas de todas las páginas van entre 4 y 35 ms
con el histórico cargado.

**Lo que NO está hecho y no es un olvido:** `/errores` y `/reloj` son de las fases 2 y 3;
`moves` está vacía; ninguna partida tiene `analysis_state = 'done'`, así que las columnas de
motor de `/aperturas` salen vacías a propósito y `v_analysis_coverage` reporta 0 analizadas.

## Estado al terminar la Fase 2

`moves` ya está poblada desde el PGN, sin motor todavía. Verificado contra el histórico real
(9.650 partidas, ~553.000 filas en `moves`): `pnpm moves:extract` demora ~2 minutos, es
idempotente (la segunda corrida encuentra 0 pendientes) y dejó 0 partidas `failed`. Los diez
chequeos de `v_data_quality` siguen en verde, incluidos los dos que dependen de `moves`
(`tiempos_de_jugada_negativos` y `conteo_de_jugadas_no_calza`).

| Pieza | Dónde |
|---|---|
| Fase de la partida, pura y testeada | `lib/chess/phase.ts` (`classifyPhase`, `isBookMove`) |
| PGN a filas de `moves` | `lib/chess/moves.ts` (`buildMoveRows`), junta `pgn.ts` + `clock.ts` + `phase.ts` |
| La única función de extracción | `lib/ingest/extract-moves.ts` (`runExtractMoves`), mismo patrón que `runIngest` |
| Página | `/reloj` |
| Migración nueva | `0006_reloj.sql` |

**`piecesAfter` se calcula una sola vez, en `parsePgn`.** `lib/chess/phase.ts` necesita saber
cuántas piezas (sin peones ni reyes) le quedan a cada bando para decidir el final, pero no
vuelve a reproducir el PGN: `parsePgn` ya cuenta el tablero después de cada jugada (con
`chess.board()`) y lo deja en `ParsedMove.piecesAfter`, igual que ya hacía con el EPD.

**`IngestStore` se extendió, no se creó un store nuevo.** `moves:extract` no tiene ruta ni cron
de Vercel, pero sí tiene workflow de GitHub Actions (`.github/workflows/moves.yml`, agregado
recién al descubrir en producción que nadie lo disparaba: el backfill completo de `ingest`
dejó miles de partidas con PGN pero sin `moves`, y el analizador de la Fase 3 las marcaba
`analysis_state = 'done'` sin haber analizado una sola jugada, porque no había nada que
analizar). Desde ahora `ingest.yml` corre `moves:extract` como paso final de cada ingesta, así
que las partidas nuevas nunca vuelven a quedar atascadas ahí. `moves:extract` igual reusa
la misma interfaz de dos transportes que `pnpm ingest` y `pnpm openings:load`: la regla del
proyecto es una interfaz con las dos implementaciones, no una por operación. Lo único nuevo del
lado de PostgREST es la vista `v_games_pending_moves` (con `security_invoker`, sin grants para
`anon`/`authenticated`): `SupabaseIngestStore` no puede expresar en PostgREST el
`left join openings + not exists (select 1 from moves ...)` que decide qué partida le falta
`moves`, así que esa vista hace ese trabajo. `PgIngestStore` hace la misma consulta directo en
SQL, sin la vista.

**Una partida con `ply_count = 0` (el rival abandonó antes de mover) no puede quedar en
`pending` para siempre.** `insertMoves` con un arreglo vacío no inserta nada, así que sin un
caso aparte esa partida reaparecería como pendiente en cada corrida de `moves:extract`. Se
marca `analysis_state = 'skipped'` (`store.markMovesEmpty`), igual que la correspondencia sin
`%clk`. Apareció una sola vez en las 9.650 partidas reales; sin ese caso, `pnpm test` habría
pasado igual porque ningún fixture lo cubre — quedó atrapado corriendo `moves:extract` contra
el histórico completo, no contra los tests unitarios.

**Las cuatro vistas nuevas van con `security_invoker` desde que se crean.** A diferencia de las
de 0001/0002/0004 (que necesitaron el arreglo retroactivo de 0005), `0006_reloj.sql` ya nace
después de esa regla: cada vista se marca `security_invoker = on` y se le revocan los grants a
`anon`/`authenticated` en la misma migración, no como parche posterior.

**Lo que la Fase 3 necesita saber.** `moves.classification`, `moves.cp_loss`, `moves.eval_cp` y
`moves.is_decided` siguen NULL/false: eso lo llena el analizador con Stockfish. `moves.phase` y
`moves.is_book` ya están listos para que las vistas de `/errores` (`v_errors_by_phase`,
`v_errors_by_move_time`, ya definidas en 0001) los usen apenas `classification` deje de ser
NULL. `games.analysis_state` sigue en `'pending'` para casi todas las partidas: la Fase 2 solo
lo toca para marcar `'skipped'` (sin jugadas) o `'failed'` (PGN no reproducible), nunca `'done'`
— eso es del motor.

## Estado al terminar la Fase 3

El motor ya corre. Sin migración nueva: las columnas de `moves` y `games` para el análisis, la
función SQL `win_pct`, el `job_kind = 'analyze'` y las vistas `v_errors_by_phase`,
`v_errors_by_move_time` y `v_analysis_coverage` ya existían desde `0001_init.sql` — solo
estaban sin poblar.

| Pieza | Dónde |
|---|---|
| Cliente UCI, aislado y testeable con un motor simulado | `lib/engine/uci.ts` |
| Los dos pasos de signo, puros | `lib/analysis/signs.ts` (`toWhitePerspective`, `computeMoveLoss`) |
| `win_pct` reimplementado en TS (tiene que dar lo mismo que la función SQL) | `lib/analysis/winpct.ts` |
| Clasificación y `is_decided` | `lib/analysis/classify.ts` |
| `divergence_ply` | `lib/analysis/divergence.ts` |
| La única función de análisis | `lib/analysis/run.ts` (`runAnalyze`) |
| Acceso a datos del analizador (un solo transporte, ver abajo) | `lib/analysis/store.ts` |
| Página | `/errores` |
| Workflow | `.github/workflows/analyze.yml` (cron diario + `workflow_dispatch` con `batch`) |
| Respaldo NDJSON a Supabase Storage | `scripts/backup-ndjson.ts`, corre como último paso del cron |

**`lib/analysis/store.ts` NO tiene dos transportes, a propósito.** A diferencia de
`IngestStore`, acá no hay un segundo camino que justifique la interfaz dual: el spec pide
conexión directa a Postgres (`update ... returning` para reclamar lotes, una transacción por
partida) y prohíbe explícitamente crear una ruta HTTP de análisis. Si alguna vez aparece un
segundo transporte real para esto, ahí sí se extrae la interfaz.

**El analizador no inserta filas en `moves`, las actualiza.** Las filas ya existen desde
`moves:extract` (Fase 2), con `san`, `uci`, `phase`, `is_book`. `runAnalyze` lee esa lista,
reproduce los prefijos UCI desde ahí (no vuelve a parsear el PGN), y hace `update ... where
game_id = $ and ply = $` por cada jugada no-libro.

**Las posiciones dentro del libro no se evalúan con el motor.** `runAnalyze` ubica el `ply`
máximo con `is_book = true` y solo manda al motor las posiciones desde ahí hacia el final (más
la posición límite, en memoria, para poder calcular la pérdida de la primera jugada no-libro —
esa fila de `moves` en particular queda con `eval_cp` NULL, coherente con que ya está excluida
de las vistas). Es el ahorro de nodos que asume `docs/ANALYSIS-SPEC.md` ("~70 posiciones
después de descartar libro").

**`mate_in` se normaliza a perspectiva de blancas, igual que `eval_cp`.** No documentado
explícitamente en el spec pero coherente con el resto del esquema: si `mate_in` quedara en
perspectiva del motor (del que mueve), mezclar ambas columnas en una consulta daría resultados
sin sentido en la mitad de las partidas, igual que le pasaría a `eval_cp` sin el paso 1 de
signo.

**El test que realmente prueba el bug de signos.**
`tests/analyze.integration.test.ts` no usa el binario real de Stockfish: usa un motor falso
determinístico (`fakeEngine` en el propio test) que deja el eval en 0 hasta una jugada de
negras específica y ahí salta a +700 (perspectiva blancas) y se queda fijo. Es la ÚNICA jugada
de toda la partida que "empeora", y es de negras — exactamente el caso donde el bug clásico del
paso 2 de signo (perdida calculada sin girar según quién movió) haría desaparecer el error. El
test verifica el `classification` exacto de esa jugada contra Postgres real, no solo contra
unitarios en memoria. `runAnalyze` acepta el motor como una interfaz (`AnalysisEngine`), no la
clase `UciEngine`, justo para que este test no necesite el binario instalado — tampoco lo tiene
el runner de `integracion` en CI.

**`lib/analysis/store.ts` y `run.ts` no están en el umbral de cobertura de 80%.** Mismo
criterio que `lib/ingest/{store,run,pg-store,supabase-store}.ts`: hablan con Postgres de
verdad y se validan con el test de integración de arriba, no con unitarios en memoria. Están
explícitamente excluidos en `vitest.config.mts` (`coverage.exclude`). `lib/engine/uci.ts` y el
resto de `lib/analysis/` (`winpct`, `mate`, `signs`, `classify`, `divergence`) sí están dentro
del umbral y a 100%.

**El workflow `analyze.yml` solo corre en `main`, a diferencia de `ingest.yml`.** No hay un
concepto de "development" para el análisis: el spec es explícito en que solo main escribe en
producción, así que el job entero tiene `if: github.ref == 'refs/heads/main'` y
`environment: production` fijo, sin la rama ternaria que sí tiene `ingest.yml`.

## Estado al terminar la Fase 4

El entrenador ya sirve ejercicios. Sin migración nueva: `puzzles`, `puzzle_attempts` y el
`job_kind = 'puzzles'` ya existían desde `0001_init.sql`, sin poblar.

| Pieza | Dónde |
|---|---|
| `UciEngine.evaluateMultiPv`, filtro de calidad | `lib/engine/uci.ts` |
| Detección de patrón del blunder, pura y testeada | `lib/chess/theme.ts` (`inferTheme`) |
| Repetición espaciada SM-2 simplificada, pura | `lib/spaced-repetition/sm2.ts` (`nextReview`) |
| Acceso a datos del constructor (un solo transporte) | `lib/puzzles/store.ts` |
| La única función de construcción | `lib/puzzles/run.ts` (`runBuildPuzzles`) |
| Escritura interactiva (repetición espaciada) | `lib/spaced-repetition/actions.ts` (`recordAttempt`) |
| Página, y primer componente cliente de la app | `app/entrenador/page.tsx`, `components/TrainerBoard.tsx` |
| Workflow | `.github/workflows/puzzles.yml` (solo `workflow_dispatch`, para disparar a mano) |

**`lib/puzzles/store.ts` tampoco tiene dos transportes, mismo criterio que `lib/analysis/store.ts`.**
`build-puzzles.ts` solo corre en GitHub Actions/local, nunca desde Vercel: no hay un segundo
camino que justifique la interfaz dual.

**El `best_uci` de cada ejercicio se recalcula fresco con MultiPV, no se reusa `moves.best_uci`.**
Un solo `evaluateMultiPv` en la posición antes del blunder da a la vez la mejor jugada y la
segunda mejor, en el mismo presupuesto de nodos, sin depender de con qué versión de Stockfish se
escribió `moves.best_uci` originalmente (podría ser una corrida vieja con el motor 16, y el
ejercicio se construye con el 19). `cp_loss`/`win_pct_loss` sí se copian de `moves`: esos ya
están bien calculados con los dos pasos de signo de la Fase 3.

**`is_unique` compara las dos líneas de MultiPV directamente, sin los dos pasos de signo.**
Ambas líneas comparten la misma posición y el mismo lado al mover, así que alcanza con
`winPct(línea1.cp) − winPct(línea2.cp)`. El paso 1/2 de signo (`lib/analysis/signs.ts`) es para
comparar ANTES/DESPUÉS de una jugada, no dos alternativas en la misma posición.

**`theme` cubre 3 de los 4 patrones sugeridos, no los 4.** `lib/chess/theme.ts` detecta
`pieza_colgada`, `mate_pasillo` y `permite_horquilla`, estructuralmente sobre el tablero después
del blunder (sin volver a llamar al motor por la respuesta real del rival). `clavada` (pin)
queda **sin implementar a propósito**: `chess.js` no expone si una pieza está clavada, y un
detector confiable sin volver a llamar a Stockfish no valía el tiempo para un heurístico
opcional — el propio prompt de la fase pide "etiquetar cuando se pueda inferir", no los cuatro.
Un ejercicio sin `theme` se sigue sirviendo igual, solo que no aparece agrupado por patrón.

**`/entrenador` es la primera página con un componente cliente.** Confirmado antes de escribir
código: el resto de la app es 100% Server Components. `TrainerBoard.tsx` necesita interacción
(arrastrar una pieza, validar contra `chess.js`) que un Server Component no puede resolver.
`react-chessboard` se fijó en `5.12.1` (requiere React 19, que el proyecto ya usa), mismo
criterio de versión exacta que `chess.js`.

**`recordAttempt` es la primera escritura interactiva de la app, y usa `supabaseAdmin()`, no
Postgres directo.** A diferencia de `build-puzzles.ts` (batch, en Actions), esta acción corre en
Vercel: aplica la regla de siempre, PostgREST con la service role key, no una conexión directa.
Lee el estado SM-2 actual de la fila, llama a `nextReview` (puro), y actualiza `puzzles` más un
insert en `puzzle_attempts` en dos llamadas — no hay `transaction()` vía PostgREST; si una de
las dos falla se loguea, no es tan crítico como sí lo es `saveAnalysis` del analizador.

**El respaldo NDJSON no cambió.** `scripts/backup-ndjson.ts` ya volcaba `puzzle_attempts` desde
la Fase 3 (aunque estuviera vacía), así que la Fase 4 no tuvo que tocar ese script.

**`analyze.yml` corre `puzzles:build` como su último paso, mismo patrón que `ingest.yml` con
`moves:extract`.** Sin blunders clasificados no hay candidatos para el entrenador, así que
encadenarlo evita el mismo error que le pasó a `moves` al principio (un backfill que deja el
siguiente paso esperando para siempre a que alguien lo dispare a mano). Reusa el binario de
Stockfish que ya bajó el paso "Instalar Stockfish" (mismo `STOCKFISH_PATH`), no lo vuelve a
bajar. `puzzles.yml` quedó solo con `workflow_dispatch`, sin `schedule` propio, para no
duplicar la corrida diaria.

**Lo que NO está hecho y no es un olvido.** `clavada` como theme (ver arriba). `docs/validacion-lichess.md`
sigue con la plantilla lista pero sin completar — es un ritual manual de Gabriel, no algo que se
automatice. El backfill real contra producción (`puzzles:build`) no se corrió como parte de esta
fase: se dispara después de mergear, igual que se hizo con `moves` y `analyze`.

## Convenciones

- Todo acceso a datos es del lado servidor: Server Components y route handlers. Nada de
  `useEffect` para traer datos que un Server Component puede resolver.
- Cada página que muestra datos derivados del motor muestra su cobertura leyendo
  `v_analysis_coverage`: "basado en X de Y partidas analizadas".
- Los rendimientos se muestran con la cota inferior de Wilson (`wilson_lower` en el SQL), no el
  porcentaje pelado. Es una aproximación deliberada, porque se aplica sobre suma de score con
  tablas incluidas: sirve para ordenar y atenuar muestras chicas, no como intervalo publicable.
- `games.termination` guarda **el resultado de Gabriel**, no el del rival. `/reloj` necesita
  distinguir sus derrotas por `'timeout'`.
- El middleware de auth debe **excluir** `/api/ingest`, que la llama el cron de Vercel con un
  bearer y no con una sesión.

## Observabilidad, no opcional

Todo proceso batch (ingesta, extracción, análisis, ejercicios, respaldo) abre una fila en
`job_runs` al empezar y la cierra al terminar, con conteos, duración, ambiente y disparador.
Una corrida que no queda registrada es una corrida que no se puede auditar.

La ingesta además **reconcilia**: compara el conteo de partidas que reporta chess.com contra el
conteo local y falla si no calzan. Es la única forma de detectar una ingesta que perdió partidas
en silencio. Detalle en `docs/CONFIANZA.md`.

## Comandos

Cada uno se agrega a `package.json` en el fase que lo crea.

| Comando | Archivo | Milestone |
|---|---|---|
| `pnpm dev` | Next.js | Fase 1 |
| `pnpm db:push` | `scripts/db-push.ts`, aplica migraciones en orden y lleva la cuenta en `schema_migrations`. Acepta `--env dev`, `--env prod` y `--db-url`. Primero dev, siempre | Fase 1 |
| `pnpm db:types` | `scripts/db-types.ts`. Con `--env` usa el CLI oficial de Supabase; con `--db-url` introspecciona cualquier Postgres (el CLI necesita Docker y no siempre hay) | Fase 1 |
| `pnpm openings:load` | `scripts/load-openings.ts`, carga los TSV de Lichess. Acepta `--from-dir` donde la red bloquea raw.githubusercontent.com. Tambien es el workflow `openings`, para operar sin terminal | Fase 1 |
| `pnpm ingest` | `scripts/ingest.ts`, mismo `runIngest` que la ruta de cron. `--full` para todo el histórico | Fase 1 |
| `pnpm moves:extract` | `scripts/extract-moves.ts`, puebla `moves` desde el PGN | Fase 2 |
| `pnpm analyze` | `scripts/analyze.ts`, el analizador con Stockfish nativo. Lo corre GitHub Actions, y también sirve en local | Fase 3 |
| `pnpm puzzles:build` | `scripts/build-puzzles.ts`, genera ejercicios | Fase 4 |

La ingesta vive además en `app/api/ingest/route.ts`, que exporta **`GET`** porque el cron de
Vercel dispara con GET.

## Dónde vive cada cosa

| Pieza | Dónde corre | Costo |
|---|---|---|
| Código | GitHub | gratis |
| App web | Vercel | gratis (plan Hobby) |
| Base de datos | Supabase | gratis (500 MB, 2 proyectos) |
| Ingesta diaria | Cron de Vercel | gratis |
| Análisis con Stockfish | GitHub Actions | gratis (2.000 min/mes en repo privado) |

Nada necesita un computador encendido. Stockfish se instala dentro del runner de GitHub Actions
bajando el binario oficial (`stockfish-linux-x86-64-universal.tar.gz`) desde los releases de
`official-stockfish/Stockfish` en GitHub, no con `apt`: el paquete de Ubuntu queda congelado en
versiones viejas (16-1build1 en 24.04), y el proyecto quiere la version actual. `engine_id` sigue
sin hardcodearse: se lee del `id name` que devuelve el binario, sea cual sea la version fijada en
el workflow.

Si alguna vez se quiere correr el analizador en un computador propio, se instala con
`brew install stockfish` (macOS, casi siempre trae una version mas nueva que la de Ubuntu) o
bajando el binario de Linux de la misma forma que el workflow, y se usa `pnpm analyze` con un
`.env.local` completo.

## Paso manual que no se puede automatizar

Supabase Auth con signups deshabilitados **no deja entrar a nadie hasta que exista el usuario**.
Después del primer deploy hay que crear el usuario a mano en el dashboard de Supabase, en
Authentication > Users, con el mismo email que `OWNER_EMAIL`. Sin eso, `signInWithOtp` falla y
la app queda inaccesible.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
