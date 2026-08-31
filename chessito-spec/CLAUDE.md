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

**El motor corre en GitHub Actions**, en un workflow programado que instala Stockfish con `apt`
y se conecta directo a Postgres. Todo el proyecto vive en la nube: Gabriel trabaja desde su
celular o desde cualquier computador y no necesita tener nada encendido.

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

**Nunca `NEXT_PUBLIC_` en la service role key.** El cliente admin vive en
`lib/supabase/admin.ts` y su primera línea es `import 'server-only'`, para que el build falle
si alguien lo importa desde un componente cliente.

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
`900+10`) y no traen `%clk`. Se ingieren, pero se marcan `analysis_state = 'skipped'` y quedan
fuera del análisis de reloj y de motor.

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
| `pnpm db:push` | aplica migraciones. Acepta `--env dev` y `--env prod`. Primero dev, siempre | Fase 1 |
| `pnpm openings:load` | `scripts/load-openings.ts`, carga los TSV de Lichess | Fase 1 |
| `pnpm ingest` | `scripts/ingest.ts`, mismo código que la ruta de cron, para correr a mano | Fase 1 |
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
con `sudo apt-get install -y stockfish`, que lo deja en `/usr/games/stockfish`.

Si alguna vez se quiere correr el analizador en un computador propio, se instala con
`brew install stockfish` (macOS) o `sudo apt install stockfish` (Linux) y se usa `pnpm analyze`
con un `.env.local` completo.

## Paso manual que no se puede automatizar

Supabase Auth con signups deshabilitados **no deja entrar a nadie hasta que exista el usuario**.
Después del primer deploy hay que crear el usuario a mano en el dashboard de Supabase, en
Authentication > Users, con el mismo email que `OWNER_EMAIL`. Sin eso, `signInWithOtp` falla y
la app queda inaccesible.
