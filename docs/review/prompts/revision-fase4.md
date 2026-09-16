# Revisión · Fase 4 · Repertorio y ciclo de estudio

Lee @CLAUDE.md, @docs/ENGINEERING.md, @docs/review/PLAN-REVISION.md y @docs/DATA-SOURCES.md.

Esta fase conecta la app con lo que el alumno estudia fuera de ella. Es la última porque es la que
menos daño repara: las tres anteriores arreglan cosas que hoy están mal; esta agrega lo que falta.

**Repertorio declarado:** Ponziani con blancas, 1…e5 contra 1.e4, esquema d5/Cf6/e6 contra 1.d4.
**Ciclo de 8 semanas:** seguridad y amenazas · finales de rey y peón · encontrar un plan ·
estructuras de peones · finales de torre · táctica con nombre · repertorio · auditoría de errores.

---

## F4-01 · Repertorio declarado

Hoy la app agrupa por la apertura que **ocurrió**, no por la que él pretendía jugar. El Ponziani
aparece partido en dos filas ("Ponziani Opening", n=165, y "Ponziani: Jaenisch Counterattack",
n=131) y no hay forma de preguntar "¿cómo me va con mi repertorio?" ni "¿qué me juegan contra
él?".

1. Tabla `repertoire`: entrada, color, rol (`mío` / `respuesta del rival`) y el conjunto de
   `openings.id` o el prefijo de EPD que la define. Son ~10 entradas y se declaran una vez, a
   mano, en una migración de datos o en una pantalla mínima. No construyas un editor.
2. Vista que agrupe las 296 partidas de Ponziani en **una sola fila**, con su Wilson y su `n`.
3. Dos números en `/aperturas`: **"llegaste a tu repertorio en X de N partidas de rápida"** y,
   para las que no, **qué te jugaron**, agrupado por la respuesta del rival.

**Se parte en dos mitades y conviene separarlas:** el **rendimiento** por respuesta del rival no
necesita motor y se puede publicar ya (Philidor n=72 a 0,458; Old Sicilian n=41 a 0,451; French
n=40 a 0,475; Four Knights Italian n=23 a 0,348; Modern n=22 a 0,364 — cinco respuestas con n
suficiente). El **ply donde se tuerce** sí necesita `n_diverged ≥ 10`, que viene de F2-05.

La lectura correcta de los datos, para que el texto de la página la diga: **su repertorio con
blancas funciona** (296 partidas de Ponziani rindiendo 0,58-0,63). El problema son las respuestas
que no preparó y las líneas con negras (Berlín 0,333 con n=27; Englund 0,394 con n=33; Lolli
0,406 con n=53). Eso es una semana de estudio perfectamente definida.

**Criterio de aceptación:** `/aperturas` muestra el repertorio como unidad; la tabla de respuestas
del rival aparece con su `n`; ninguna fila con n<20 lleva recomendación.

## F4-02 · Tema de la semana

No construyas un curso ni una pantalla de ajustes. La app no tiene una, y agregarla por un solo
campo no vale.

1. Una **fecha de inicio del ciclo** en la configuración del proyecto y la lista de los 8 temas en
   código. La semana en curso se deriva de la fecha. Cero interfaz de captura.
2. Hace tres cosas y ninguna más:
   - ordena la cola de ejercicios (prioridad 2 de F2-03),
   - da el título de una línea en la portada: "Semana 1 · seguridad y amenazas",
   - al cerrar la semana, responde la única pregunta que importa: los errores de ese tipo esta
     semana contra el promedio de las cuatro anteriores.
3. El mapeo tema → `theme`/`concepto` no es perfecto y no hace falta que lo sea. "Seguridad y
   amenazas" cubre `pieza_colgada`, `cuelga_la_pieza_movida`, `abandonas_la_defensa` y
   `no_atiendes_la_amenaza`, que ya existen en `lib/puzzles/diagnostico.ts`.

**Sin racha, sin porcentaje de cumplimiento, sin notificaciones.** Una línea que dice qué semana
es, y una cola ordenada.

**Criterio de aceptación:** la portada dice la semana y el tema; la cola de ejercicios los prioriza;
al cerrar la semana aparece la comparación con las cuatro anteriores, con su `n`.

## F4-03 · `rated`

`rated` se valida en el contrato Zod (`lib/chess/chesscom.ts:32`) y se descarta en el mapeo
(`lib/chess/game.ts:113-137`). Las partidas amistosas entran con el mismo peso en Wilson, en la
tasa de error y en el rendimiento por apertura.

Columna `games.rated boolean`, poblada en la ingesta, y filtro por defecto en las vistas de
rendimiento. Requiere re-pedir los archivos a chess.com (el dato viene del JSON, no del PGN); la
ingesta completa demora ~2 minutos y es idempotente.

**Está al final a propósito:** no se pudo medir qué fracción del histórico son amistosas, así que
el beneficio no está demostrado y el costo es una reingesta completa.

**Criterio de aceptación:** `games.rated` poblada en todo el histórico; las vistas de rendimiento
la filtran; un chequeo en `v_data_quality` que detecte filas sin `rated` tras la reingesta.

## F4-04 · Limpieza de deuda de confianza

1. `v_monthly_activity` (0001), `v_conceptos_fallados` (0009) y `v_opening_resolution` (0004)
   fueron superadas y no las lee nadie. **No las borres** —nunca se edita una migración
   aplicada— pero anótalas con `comment on view` diciendo cuál las reemplaza.
2. `openingResolution()` (`lib/data.ts:57`) no la llama ninguna página desde la Fase 5. Bórrala.
3. `docs/CONFIANZA.md:109-121` describe la reconciliación por conteo mensual contra
   `v_games_by_month`, que `0003_session_features.sql:3-13` declara **inviable** y reemplaza por
   UUID a UUID. Para un proyecto cuyo argumento central es "no creas los números, verifícalos", un
   documento de confianza que describe un mecanismo que ya no existe es deuda de confianza, no
   deuda técnica. Actualízalo.
4. `v_analysis_coverage.n_failed` nunca ha valido otra cosa que 0 en las cuatro clases. Déjalo,
   pero anótalo.

**Criterio de aceptación:** ninguna vista superada queda sin comentario; `openingResolution()` ya
no existe; la capa 4 de `CONFIANZA.md` describe la reconciliación que efectivamente corre.

---

## Antes de dar la fase por terminada

- CI en verde.
- Capturas a 390 px de `/aperturas` y de la portada.
- `CLAUDE.md`, `PLAN.md` y `docs/review/BITACORA.md` actualizados.
