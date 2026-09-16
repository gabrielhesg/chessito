# Revisión · Fase 2 · El ciclo de la derrota

Lee @CLAUDE.md, @docs/ENGINEERING.md, @docs/review/PLAN-REVISION.md y @docs/review/01-pedagogia.md.

Esta es la fase que convierte la app de panel en entrenador. Cierra el lazo entre perder, revisar
y entrenar. Requiere la Fase 1 terminada (en particular R3 y R7).

**El ritual que esta fase existe para soportar:** *toda derrota se analiza primero sin motor*. Hoy
la app no solo no lo soporta: lo **sabotea**, porque abrir `/partida/[id]` entrega precisión,
glifos `??`, evaluación por jugada y "Tu peor jugada fue Nxf7" antes de que el alumno mire.

---

## F2-01 · `game_reviews` y la cola de derrotas sin revisar

1. Tabla `game_reviews`: `game_id`, `ply_marcado`, `motivo` (lista cerrada), `ply_del_motor`,
   `creado_en`. Una fila por partida revisada.
2. `motivo` es una **lista cerrada tocable**, no un campo de texto. Cuatro o cinco opciones:
   "colgué material", "no supe qué hacer", "me quedé sin tiempo", "me superaron en la apertura".
   En celular un chip es un tap y un teclado es una fricción que mata el hábito; y una lista
   cerrada es lo que después permite agrupar. Si quieres dejar un campo de texto libre opcional,
   que sea secundario y nunca obligatorio.
3. La tarea 2 del plan de hoy (R7) gana su casilla: se marca sola al terminar la revisión.
4. Filtro "sin revisar" en `/registro`, al lado de los que ya existen, y la fila de una derrota de
   rápida sin revisar se distingue. Solo rápida: revisar bala no está en el plan.
5. Máximo tres derrotas pendientes en la portada. Si son 40, se muestran tres y se dice "y 37
   más". Nunca la deuda completa: es la misma lección que los 397 ejercicios.

**Criterio de aceptación:** marcar una derrota como revisada quita su tarea de la portada; el
filtro de `/registro` funciona; la tabla es nueva y ninguna migración anterior se editó.

## F2-02 · Modo "Primero yo" en `/partida/[id]`

1. Cuando la partida es una **derrota de rápida**, la pantalla abre en modo ciego por defecto:
   tablero, jugadas en SAN, relojes y navegación. Sin evaluación, sin clasificación, sin gráfico,
   sin precisión, sin momentos clave. Todo eso se renderiza hoy en el servidor y siempre
   (`app/partida/[id]/page.tsx`), así que el cambio es de arquitectura de la página, no un
   `display: none`.
2. El alumno marca en la lista **la jugada donde cree que se perdió la partida** y elige un motivo
   de la lista cerrada. Dos gestos.
3. Al confirmar se revela todo **y se compara**: "marcaste la jugada 14; el motor dice que fue la
   8". Ese contraste es el ejercicio, no el informe.
4. Se guarda en `game_reviews` y con eso queda registrada como revisada.
5. Un botón de escape visible ("Ver lo que dice el motor") para cuando no quiera hacer el ritual.
   No lo obligues.

**Criterio de aceptación:** abrir la derrota más reciente de rápida no muestra ningún número del
motor hasta confirmar; tras confirmar aparece la comparación de plies; la fila queda en
`game_reviews`.

## F2-03 · Sesión dirigida y "¿qué pasó?"

1. La sesión de 10 (R6) deja de elegirse por `due_at` y usa prioridad explícita:
   (a) ejercicios de las **derrotas de rápida de los últimos 7 días**, (b) el tema de la semana si
   existe (Fase 4), (c) la cola de repaso normal.
2. Desde `/partida/[id]`, tras el modo ciego, un botón "Entrenar los N errores de esta partida".
   El enlace por posición ya existe (`?partida=&ply=`, `app/entrenador/page.tsx:60-64`); falta el
   que sirve la tanda.
3. Chips de patrón sobre el tablero del entrenador para elegir a qué le dedicas la sesión. Esto
   **no está bloqueado** por la cobertura: los ejercicios se sirven de todas las clases por
   decisión de la Fase 12, y hay 121 de `pieza_colgada`.
4. Al **fallar** un ejercicio (solo al fallar), una pregunta de un tap antes de revelar: "¿qué
   pasó?", con tres o cuatro opciones tomadas de los conceptos reales de
   `lib/puzzles/diagnostico.ts`. Se guarda en `puzzle_attempts.concepto_elegido`, al lado del
   `concepto` que ya se guarda.
   Con eso aparece la métrica que hoy no existe: **no solo qué error comete, sino cuáles
   reconoce**. Un error que comete y reconoce se corrige con práctica; uno que comete y no
   reconoce necesita estudio. Son dos tratamientos distintos.
   Esta es además la sonda barata: si la captura de autodiagnóstico funciona acá, el modo ciego de
   F2-02 vale la pena; si nadie la contesta, hay que repensarlo.

**Aviso que salió de la revisión cruzada:** "entrena los errores de tu derrota de ayer" hoy
devuelve vacío casi siempre, porque los ejercicios se construyen desde `classification = 3` y solo
hay 108 partidas de rápida analizadas (16 de 400 ejercicios vienen de rápida). El punto 1 depende
de F2-05.

**Criterio de aceptación:** la sesión respeta la prioridad y se puede demostrar con un test; el
botón desde `/partida` sirve los ejercicios de esa partida; al fallar aparece la pregunta de un
tap y la respuesta queda guardada.

## F2-04 · `/reloj` separa clases de tiempo

Las cuatro vistas de `0006_reloj.sql` (`v_move_time_by_ply`, `v_move_time_by_phase`,
`v_move_time_distribution`, `v_timeout_moment`) **no tienen dimensión `time_class`**: promedian
una partida de 1 minuto con una de 10. Con 1.850 de bala, 5.660 de blitz y 2.588 de rápida, lo que
describen es la bala.

Vistas nuevas con `time_class` en el `group by` (no edites 0006), y la página fija `rapid`, con
las otras clases disponibles en la tabla. Es el mismo patrón que ya usa `v_errors_by_move_time`,
que sí tiene la dimensión.

**Criterio de aceptación:** `/reloj` declara que muestra rápida; los tres `Stat` de arriba se
calculan sobre rápida; ninguna cifra de la página mezcla clases.

## F2-05 · Backfill de rápida con meta acotada

El objetivo **no** es analizar las 2.588. Es alcanzar dos umbrales concretos:

1. Las ~300 partidas de rápida más recientes analizadas, que es lo que sostiene la ventana de 20
   de la North Star y la serie mensual.
2. `n_diverged ≥ 10` en las cinco aperturas principales del repertorio, que es lo que exige
   `docs/ANALYSIS-SPEC.md:248-257` para que la columna de divergencia signifique algo.

Costo estimado: el desbloqueo completo son 2.480 partidas ≈ 578 minutos de GitHub Actions ≈ 29 %
del cupo mensual gratuito, en 2-3 corridas por el tope de 6 h por job. La meta acotada cuesta
bastante menos. Se dispara con `workflow_dispatch` y su parámetro `batch`, como siempre.

**Criterio de aceptación:** `v_analysis_coverage` (la nueva, con `n_skipped`) reporta al menos 300
partidas de rápida en `done`; al menos cinco aperturas de rápida tienen `n_diverged ≥ 10`.

---

## Antes de dar la fase por terminada

- CI en verde: lint, typecheck, test y build.
- Capturas a 390 px de `/partida/[id]` en modo ciego y después de revelar, y de `/entrenador`.
- Los chequeos de `v_data_quality`, incluidos los cuatro nuevos de la Fase 1, en verde.
- `CLAUDE.md`, `PLAN.md` y `docs/review/BITACORA.md` actualizados.
