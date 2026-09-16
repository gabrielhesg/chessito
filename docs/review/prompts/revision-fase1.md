# Revisión · Fase 1 · Que la app hable de rápida y diga lo que ya sabe

Lee @CLAUDE.md, @docs/ENGINEERING.md, @docs/review/PLAN-REVISION.md y @docs/review/00-inventario.md.

Esta fase no agrega pantallas. Arregla lo que la app mide y lo que dice. `docs/ENGINEERING.md` es
criterio de aceptación: TypeScript strict sin `any`, tests con Vitest, CI en verde, migraciones
nuevas que nunca editan una aplicada, toda vista nueva con `security_invoker = on` y sin grants
para `anon`/`authenticated`.

Los hechos que justifican cada ítem están medidos y citados en `docs/review/00-inventario.md`. No
vuelvas a medirlos: úsalos.

**Regla que aplica a todo:** el riesgo principal del proyecto es que usar la app reemplace a jugar
ajedrez. Sin gamificación, sin rachas, sin notificaciones.

---

## R1 · Rápida por defecto en toda la app

La clase de tiempo se elige hoy por volumen (`claseDominante` en `app/page.tsx:105-108`,
`claseGrafico` en `app/ritmo/page.tsx:26-31`) y tiene que elegirse por intención: el plan del
alumno es rápida, cero bala.

1. El calendario de la portada se pinta con `n_rapid`, no con `n_games` (`app/page.tsx:136`). Los
   días con partidas de otra clase van en un tercer tono, distinto de "sin jugar", y la leyenda lo
   dice.
2. El número grande de rating es **siempre** el de rápida. Se acabó `claseDominante`. Ojo:
   `monthlyActivity()` trae `limit(24)` **filas**, no 24 meses (`lib/data.ts:36-45`); si necesitas
   24 meses de rápida, filtra en la consulta.
3. Debajo del calendario, una frase con el número que hoy no tiene nombre: "436 de bala este mes.
   Tu plan dice cero hasta 1500." El conteo sale de `v_monthly_summary.n_bullet`. Es una frase,
   no una insignia ni un castigo.
4. `/aperturas` filtra `time_class = 'rapid'` por defecto, con la misma justificación escrita que
   ya tiene `/errores` (`app/errores/page.tsx:40-43`). Hoy el gráfico mezcla las tres clases y la
   clase solo vive en un `title`, que no abre con tap.
5. `/ritmo` fija `rapid` en vez de elegir por volumen.
6. El bloque "Esto no mejora" de la portada usa solo aperturas de rápida.

**Criterio de aceptación:** en la captura de la portada a 390 px el rating dice "rápida"; el
calendario de septiembre tiene 5 días encendidos y no 15; aparece la palabra "bala" con su número;
`/aperturas` y `/ritmo` no muestran ninguna fila de otra clase sin etiquetarla.

## R2 · Cobertura honesta

`/errores` declara "1.782 de 10.106 partidas analizadas" mientras filtra `CLASE = 'rapid'`:
`analizadas` y `totales` suman **todas** las clases (`app/errores/page.tsx:46-47`). El número
honesto es 108 de 2.588.

1. La línea de cobertura se deriva del **mismo corte** que alimenta el gráfico. Vale para
   `/errores` y para `/aperturas` tras R1.
2. Vista nueva en la migración de esta fase que agrega `n_skipped`, porque hoy
   `108 + 1.074 + 0 ≠ 2.588` y las excluidas desaparecen del denominador sin dejar rastro. No
   edites `v_analysis_coverage` (0001): crea la vista nueva y deja la vieja.

**Criterio de aceptación:** `/errores` dice "108 de 2.588 de rápida"; la vista nueva cumple
`done + pending + failed + claimed + skipped = n_games` por clase.

## R3 · Reparar el universo de análisis

4.777 partidas jugables están marcadas `skipped`, 1.406 de ellas de rápida, todas con sus jugadas
y sus relojes extraídos. Ningún camino del código las explica (`lib/chess/game.ts:105` solo marca
variantes, correspondencia y `daily`; `markMovesEmpty` solo marca las de PGN vacío).

1. Columna `games.skip_reason text null`, poblada en la ingesta con el motivo real
   (`variante`, `correspondencia`, `daily`, `sin_jugadas`). Un dato excluido siempre se nombra.
2. Migración **reversible** que devuelve a `pending` toda partida `skipped` que no cumpla ninguna
   de las cuatro condiciones. No borra ninguna fila y no toca `moves`.
3. `claimBatch` (`lib/analysis/store.ts:71`) ordena hoy
   `(time_class in ('rapid','blitz')) desc, end_time desc`, o sea rápida y blitz empatadas: separa
   las claves para que rápida vaya **antes** que blitz. Test que lo demuestre.
4. Tres chequeos nuevos en `v_data_quality` (es `create or replace view`, así que se extiende sin
   editar 0002): `skipped_sin_motivo`, `estados_no_suman` y `cobertura_sesgada_por_clase`.

**Criterio de aceptación:** tras aplicar la migración en dev,
`select count(*) from games where analysis_state='skipped' and skip_reason is null` da 0;
`claimBatch` devuelve rápida antes que blitz; los tres chequeos existen y se ponen rojos donde
deben.

## R4 · Todo panel que pregunta, responde

Dos de las cuatro preguntas del proyecto ya tienen respuesta medida y la app la calla.

1. **`/errores`**, panel "¿Los errores se concentran en las jugadas rápidas?": la respuesta es
   **no**. Tasa de error en rápida: 3,4 % bajo 3 s, 8,4 % entre 3 y 10 s, 8,6 % entre 10 y 30 s,
   18,4 % sobre 30 s. Monótono, y replicado en blitz (4,5 % → 20,4 %). El título del panel pasa a
   ser la conclusión ("Tus errores están donde más piensas, no donde vas rápido"), la pregunta
   baja al subtítulo, y debajo va la advertencia de causalidad en una línea: pensar mucho
   correlaciona con posiciones difíciles.
2. **`/ritmo`**: tilt y fatiga miden **efecto nulo**. Tras ganar 0,535 (Wilson 0,503, n=959), tras
   perder 0,511 (Wilson 0,479, n=987); por índice de sesión, seis cortes entre 0,504 y 0,578 con
   los intervalos solapados. Los dos gráficos se reemplazan por dos frases con su `n` y su
   intervalo. **No** los escondas detrás de un `<details>`: en esta app `<details>` ya significa
   "la tabla exacta", y un `<details>` cerrado es un anzuelo. La evidencia de un nulo son los
   números, que ya están en la tabla.
3. El corte horario sí tiene señal (11 h: Wilson 0,535 con n=168; 13 h: 0,388 con n=213) y se
   queda, con dos arreglos: el eje deja de ir de 0 a 100 % —todos los datos viven entre 40 % y
   62 % y las barras salen planas— y lleva una advertencia de comparación múltiple: son 24
   buckets probados a la vez, así que el hallazgo es sugerente, no establecido.

**Criterio de aceptación:** `/errores` contiene la frase con 3,4 % y 18,4 % y su advertencia;
`/ritmo` dice "no hay efecto" con el `n` y el intervalo; el gráfico horario tiene el eje acotado y
su advertencia.

## R5 · La fase, corregida y re-derivada

`lib/chess/phase.ts:14` usa `ENDGAME_MAX_PIECES = 6` contando piezas sin peones ni reyes, y al
inicio cada bando tiene **7**: basta un cambio por bando para declarar "final". Es fiel al prompt
de la Fase 2 (`docs/prompts/fase2-reloj.md`, punto 5), que es donde está el error: **corrige
también ese prompt**.

Medido: en rápida hay 876 jugadas de apertura, **112** de medio juego y **2.041** de final, y 102
de 130 errores graves caen en "final". `v_timeout_moment` pone 853 de 854 derrotas por tiempo en
"final". Sobre una muestra de 60 partidas reales de rápida (4.112 plies) el criterio actual deja
el 66,5 % de los plies en "final".

1. Nuevo criterio: **el final empieza cuando el material no-peón de los dos bandos suma 13 puntos
   o menos**, con D=9, T=5, A=C=3. Medido sobre la misma muestra: 16,7 % final, 54 % medio juego,
   29 % apertura. Los otros candidatos medidos, por si quieres ver la tabla: `≤3 piezas por bando`
   → 34,3 % final; `suma ≤6 piezas` → 35,6 %; `material ≤20` → 23,6 %.
2. `classifyPhase` recibe el material, no solo el conteo de piezas. `parsePgn` ya recorre el
   tablero después de cada jugada (`lib/chess/pgn.ts:100`): calcula el material ahí mismo, junto
   a `piecesAfter`, y no vuelvas a reproducir el PGN.
3. `pnpm moves:rephase`: re-deriva `moves.phase` para el histórico completo desde `games.pgn`.
   Idempotente, reanudable, abre y cierra su fila en `job_runs` como todo proceso batch, y usa la
   misma interfaz de dos transportes que `moves:extract`. No toca ninguna otra columna de `moves`.
4. Chequeo nuevo `fase_final_implausible` en `v_data_quality`: la proporción de jugadas propias en
   fase "final" no supera un umbral razonable (35 %).

**Criterio de aceptación:** sobre las 60 partidas de la muestra el "final" cae de 66,5 % a ≈17 %
de los plies y el medio juego sube sobre 50 %; tests unitarios de `classifyPhase` con posiciones
reales de cada fase; `pnpm moves:rephase` corrido dos veces seguidas no cambia ninguna fila la
segunda vez.

## R6 · El plan de hoy se puede completar

Hoy la portada dice "Tu plan de hoy: 397 ejercicios vencidos, ~397 min" y su contador es
`rapidas >= 30 && vencidos === 0 ? 2 : 0` (`app/page.tsx:176`): **solo puede valer 0 o 2**, con
condiciones mensuales y de deuda total. Va a decir 0/2 después de entrenar y después de jugar.

1. Tres tareas, todas terminables **hoy**, en este orden: jugar rápida, revisar tu derrota (R7),
   10 ejercicios.
2. La meta diaria de rápida se **deriva**: lo que falta para la meta del mes dividido por los días
   que quedan. Hoy son 15 en 14 días → 1 por día. No una constante.
3. El contador cuenta lo hecho **hoy** y puede valer 1/3 y 2/3. Las partidas de hoy salen de
   `v_games_by_day`; los ejercicios, de `sessionToday`.
4. La sesión es de **10 ejercicios**, no la cola. La portada nunca muestra 397. La estimación en
   minutos sale de la mediana real de `puzzle_attempts.ms_taken`, no de una constante de 1 minuto.
5. Un enlace para ir a jugar. Hoy "Jugar 2 partidas de rápida" es texto plano mientras "Entrenar"
   tiene dos botones coral.
6. `nextReview` (`lib/spaced-repetition/sm2.ts:33-38`) devuelve `dueAt = now` al fallar, o sea el
   programador **fabrica** la deuda que nunca baja. Al fallar, el ejercicio vuelve como mínimo al
   día siguiente. Reintentar dentro de la sesión ya existe y es correcto: no lo toques.
7. "Lo próximo que vence" y su segundo botón salen de la portada: es la misma deuda mostrada dos
   veces. Su lugar es `/entrenador`.

**Criterio de aceptación:** la portada nunca muestra un número mayor que 10 como tarea; el
contador refleja lo hecho hoy y puede valer 1/3 y 2/3; hay un enlace a jugar; test de `nextReview`
que al fallar devuelve `dueAt` de mañana o después.

## R7 · Tu última derrota de rápida, a un tap

Llegar a la última derrota cuesta hoy 5 taps más un scroll horizontal que la interfaz no
señaliza. Es la entrada del ciclo de aprendizaje.

1. Bloque en la portada, dentro del plan de hoy: rival, apertura, resultado y fecha, enlazado a
   `/partida/[id]`.
2. `listGames` ya acepta `result` y `timeClass` (`lib/data.ts:322`): no hace falta vista nueva.
3. Si no hay ninguna, el bloque lo dice en verde y no ocupa lugar. Ese estado es una recompensa
   honesta, no una racha.
4. Todavía **no** hay forma de marcarla como revisada: eso es `game_reviews`, de la Fase 2. En
   esta fase la tarea aparece sin casilla, como enlace.

**Criterio de aceptación:** desde la portada, 1 tap llega a `/partida/[id]` de la derrota de
rápida más reciente.

## R8 · El panel de patrones deja de mentir

`v_conceptos_fallados_rapida` calcula `aciertos = count(*) filter (attempt_no = 1 and correct)`
dentro de un `where concepto is not null` (`0010:24-30`), y `concepto` solo se escribe cuando se
**falla** (`lib/spaced-repetition/actions.ts:26-29`). El 0 % del panel es estructural: no puede
valer otra cosa, ni con 500 ejercicios.

1. Vista nueva (no edites 0010) donde el numerador y el denominador salgan del **ejercicio**, no
   del intento fallado. O, si prefieres lo honesto y simple: **quita la tasa** y deja el conteo de
   intentos por concepto. La regla que el propio proyecto se dio en la Fase 12 aplica: un dato se
   borra cuando se puede demostrar que no significa nada.
2. Umbral mínimo de **ejercicios distintos** (5) para mostrar el panel. Hoy muestra una tasa sobre
   3 ejercicios: 170 intentos sobre 3 posiciones son 3 observaciones, no 170. El `n` que se
   muestra tiene que ser el de la unidad independiente.
3. `empeora_la_posicion` se lleva el 74 % de los intentos y es el cajón de "ninguno de los
   otros". No se muestra como si fuera un patrón: va aparte, como "sin patrón reconocido".

**Criterio de aceptación:** el panel no muestra ningún 0 % estructural; con menos de 5 ejercicios
distintos no se muestra; el residuo aparece separado.

## R9 · Bugs de `/partida/[id]`

Ocho errores de consola en la mejor pantalla de la app, verificados abriéndola a 390 px y a
1280 px.

1. **Error de hidratación:** `Ayuda` renderiza un `<details>/<summary>`
   (`components/ui/ayuda.tsx:9-11`) y está usado dentro de un `<p>` en dos lugares:
   `app/partida/[id]/page.tsx:41-44` (el componente `Mini`) y `:282-290`. `<details>` no puede ser
   descendiente de `<p>`. Los demás usos de `Ayuda` (en `<th>` y encabezados) están bien.
2. **`Each child in a list should have a unique "key" prop`**, señalado en el árbol de
   `GameReview`.
3. La tarjeta dice "GRAVES 1" (`games.blunders`, solo de Gabriel) y el pie del gráfico dice
   "2 errores graves marcados", porque `EvalChart` filtra `classification === 3` sin mirar
   `is_mine` (`components/charts/EvalChart.tsx:70-72`). Dos números distintos para lo mismo a
   300 px de distancia. O cuenta solo los suyos, o dice explícitamente que cuenta los dos bandos.

**Criterio de aceptación:** cero errores de consola al abrir `/partida/[id]` a 390 px y a 1280 px;
la tarjeta y el pie del gráfico son consistentes.

## R10 · Contraste AA y tablas legibles en celular

1. `--color-apagado` (`#5e6b65`) sobre `--color-panel` (`#111714`) da **3,26:1**, bajo el mínimo
   AA de 4,5:1, y se usa en texto de 10,5-11 px: ejes de gráficos, `.eyebrow`, calendario. Súbelo
   hasta pasar 4,5:1 sobre `--color-panel` **y** sobre `--color-panel-alto` (donde hoy da 2,99:1).
   `--color-tenue` ya pasa (6,21:1) y no se toca.
2. Las tablas llevan `min-w-[32rem]` (`components/ui/table.tsx:96`) y se cortan en cinco pantallas
   a 390 px sin ninguna señal de que hay más a la derecha. En `/registro` quedan fuera el
   resultado y la acción "Analizar"; en `/errores`, la columna de **tasa**, que es la que da la
   conclusión. Agrega una señal de scroll (sombra en el borde o indicador), y en `/registro` haz
   que la fila completa sea tappable, no solo el texto de "Analizar".

**Criterio de aceptación:** el ratio calculado de `--color-apagado` sobre `--color-panel` es
≥4,5:1; en `/registro` a 390 px hay una señal visible de que la tabla continúa.

## R11 · Formato base visible

Hay **19** partidas con `time_control = '900+10'` (15+10, el formato base declarado) contra
**2.569** con `'600'` (10+0). Ninguna vista ni página distingue formatos dentro de `rapid`, aunque
`base_seconds` e `increment_secs` existen desde `0001_init.sql:56-57`.

Muestra el desglose por formato junto al conteo de rápida del mes. `formatTimeControl`
(`lib/chess/timecontrol.ts`) ya existe y está testeado al 100 %. Esto va **antes** o junto con el
enlace de jugar de R6: si empieza a jugar 15+10 sin esta dimensión, sus partidas nuevas dejan de
ser comparables con las 2.569 de 10+0.

**Criterio de aceptación:** la portada muestra "15 de rápida: 15 en 10+0, 0 en 15+10".

---

## Antes de dar la fase por terminada

- `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` en verde.
- Capturas a 390 px de cada pantalla tocada, antes y después.
- Los diez chequeos de `v_data_quality` que ya existían siguen en verde.
- Nada de la sección 2 de `PLAN-REVISION.md` ("Qué funciona bien y hay que proteger") dejó de
  funcionar.
- Una sola migración nueva para toda la fase, con todas las vistas en `security_invoker = on` y
  sin grants para `anon`/`authenticated`.
- `CLAUDE.md` y `PLAN.md` actualizados.
- Bitácora en `docs/review/BITACORA.md`.
