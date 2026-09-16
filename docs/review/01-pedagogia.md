# 01 · Pedagogía

**Revisor:** profesor de ajedrez con formación en datos
**Alumno:** Gabriel, 1243-1268 en rápida, meta 2000. Usa la app desde el celular.
**Fuentes:** `docs/review/00-inventario.md` (única fuente de datos), `docs/review/00-benchmark.md`,
las 18 capturas de `docs/review/capturas/`, y el código del worktree
`/home/user/chessito-review` en el commit `1855bd7`.

**Filtro aplicado a toda propuesta:** el riesgo principal es que construir o usar la app
reemplace a jugar ajedrez. Ninguna propuesta de este informe agrega una pantalla nueva para
mirar. Las que agregan algo, agregan un paso del ciclo de aprendizaje o quitan fricción entre
jugar y corregir. Lo que no pasó el filtro está descartado explícitamente al final.

**Lo que no pude verificar:** no tengo acceso a la base ni al deploy. Todo número viene del
inventario o del código. Las capturas se tomaron contra un arnés de datos reales (ver §6 del
inventario), así que el snapshot del entrenador dice "3 ejercicios" donde el número real es 397.

---

## A. La pregunta central, pantalla por pantalla

La prueba que le aplico a cada pantalla es una sola: **después de verla, ¿qué hace distinto el
alumno en su próxima partida?** No "¿es bonita?", no "¿es correcta?". Si la respuesta es "nada",
la pantalla informa pero no enseña.

| Pantalla | Qué hace distinto el alumno después de verla | Veredicto |
|---|---|---|
| `/` | Hoy: nada, o peor que nada. El número grande es el rating de **blitz**, el calendario se enciende con partidas de **bala** y la primera tarea es una deuda de 397 ejercicios. La única línea accionable ("jugar 2 partidas de rápida") queda tercera en jerarquía visual. | **Contraproducente** (PED-01, PED-03) |
| `/errores` | Nada. Ve tres barras y la conclusión más importante del proyecto —sus errores están en las jugadas que **más** piensa, no en las rápidas— nunca se escribe. Además el diagnóstico de fase le miente: le dice "finales" donde es medio juego. | **Informa mal** (PED-02, PED-11) |
| `/entrenador` | Sí hace algo distinto: es la única pantalla que entrena. Pero le sirve el ejercicio más viejo de la cola, casi siempre de una partida de bala de hace meses, sin relación con lo que perdió ayer ni con el tema de la semana, y con 2,3 % de acierto histórico. | **Enseña, mal dirigido** (PED-14, PED-15) |
| `/partida/[id]` | Sí, y es la mejor pantalla de la app. Pero le entrega el veredicto del motor antes de que él mire (evaluaciones en la lista de jugadas, `??` marcado, "Tu peor jugada fue Nxf7"), que es exactamente el ritual que su plan prohíbe saltarse. | **Enseña, pero rompe el ritual** (PED-06) |
| `/aperturas` | Casi nada útil, y algo dañino: el gráfico mezcla bala, blitz y rápida, así que las ocho "peores con blancas" no son su repertorio. Su Ponziani (296 partidas de rápida, rindiendo 0,58-0,63) no aparece en ningún lado. | **Informa mal** (PED-08, PED-09) |
| `/ritmo` | Nada. Medido, no hay efecto: los intervalos de Wilson se solapan por completo en tilt y en fatiga. La captura lo muestra de forma literal —seis barras idénticas en "Fatiga", tres idénticas en cada "Tilt"—. La página no dice que el efecto es nulo. | **Nada** (PED-12) |
| `/reloj` | Nada accionable. "47,7 % de jugadas bajo 3 segundos" está calculado sobre 289.727 jugadas de las que la mayoría son de bala, y "854 derrotas por tiempo" están todas en una fase que está mal clasificada. | **Informa mal** (PED-19) |
| `/registro` | Sirve de índice. Pero no marca qué derrotas ya revisó, así que no puede sostener "toda derrota se analiza". Y su contenido real —30 partidas de 2+1 seguidas el mismo día— es el hecho más importante del mes y la app no lo comenta. | **Índice, no enseñanza** (PED-07) |
| `/salud` | Nada de ajedrez, y está bien: existe para poder creerle a las otras. Cumple. Su problema es que los 10 chequeos están en verde mientras 4.777 partidas jugables están excluidas del motor. | **Correcta, ciega** (PED-10) |
| `/entrar` | N/A. | — |

**Resumen:** de nueve pantallas de contenido, **dos** cambian lo que el alumno hace
(`/partida` y `/entrenador`), y las dos están mal conectadas con el resto. Las otras siete
informan. Cuatro informan cosas falsas o mal atribuidas.

---

## B. Hallazgos

### PED-01 | La portada premia la conducta que el plan prohíbe

- **Evidencia:** `capturas/portada-390.png`: el número grande dice "RATING BLITZ · 1.126 · -8";
  el calendario del mes está verde los 15 días; debajo del "15 / meta 30" dice "455 partidas en
  total este mes". Inventario §3.2: de esas 455, **436 son de bala**. Últimos 90 días: 1.600 de
  bala, 752 de blitz, **48 de rápida**. `app/page.tsx:136` pasa `n_games` a `MonthCalendar`
  (todas las clases) aunque `v_games_by_day` expone `n_rapid`. `app/page.tsx:105-108` elige
  `claseDominante` por volumen.
- **Hecho:** el calendario, el total del mes y el rating grande cuentan bala. El plan declarado
  del alumno es **cero bala hasta 1500**.
- **Opinión:** es el hallazgo más grave del informe. La pantalla que existe para empujar a jugar
  rápida le está devolviendo un mes verde, completo, con rating y tendencia, construido casi
  entero con la única cosa que se prometió no hacer.
- **Problema:** la app no tiene ningún concepto de "esto cuenta para mi plan" y "esto no". Trata
  toda partida como actividad, y la actividad es lo que celebra.
- **Impacto en el alumno:** refuerzo positivo de la fuga. Ningún número de la app se pone rojo
  cuando juega 436 partidas de bala en 15 días; al contrario, se llena de verde. El dato más
  elocuente del inventario es que su máximo histórico de rápida (1464) coincide con su mes de
  más rápida (408 partidas en 2026-02), y hoy está en 1268 con 15 partidas en el mes. La app
  tiene los dos hechos y no los junta.
- **Propuesta concreta:**
  1. El calendario cuenta **solo rápida** (`n_rapid`). Un día con 40 de bala y 0 de rápida es un
     día sin jugar, y debe verse gris.
  2. El rating grande es el de **rápida**, siempre, sin elegir clase dominante por volumen.
  3. Reemplazar "455 partidas en total este mes" por una línea que nombre lo que hay:
     "436 de bala este mes. Tu plan dice cero hasta 1500." Sin insignias, sin racha, sin
     castigo gamificado: una frase con el número.
  4. En "Estás mejorando" / "Esto no mejora" poner la comparación que sí tiene datos:
     rating de rápida vs su máximo, y partidas de rápida este mes vs el mismo mes anterior.
- **Otras visiones que toca:** UX (jerarquía de la portada), BI (`v_games_by_day.n_rapid` ya
  existe; falta una derivación de adherencia al plan).
- **Impacto:** **alto** · **Esfuerzo:** S (el dato ya está; es cambiar qué columna se lee)

---

### PED-02 | La app le dice que su problema son los finales. Su problema es el medio juego.

- **Evidencia:** `lib/chess/phase.ts:14`, `ENDGAME_MAX_PIECES = 6` contando piezas sin peones ni
  reyes; al inicio cada bando tiene 7. Basta **un cambio de pieza por bando** para declarar
  "final". Inventario §3.6: en rápida, 876 jugadas de apertura, **112** de medio juego, **2.041**
  de final; 102 de los 130 errores graves caen en "final". `v_timeout_moment`: **853 de 854**
  derrotas por tiempo en "final". `capturas/errores-390.png` lo muestra: "Medio juego 112" contra
  "Final 2.041".
- **Hecho:** lo que la app llama "final" es el medio juego. El bug es doble: el límite de apertura
  también es `max(openingPlyCount, 20)`, así que el medio juego queda aplastado entre un piso de
  ply 20 y un techo que llega con el primer cambio.
- **Opinión:** esto no es un error de cálculo, es un error de diagnóstico clínico. La debilidad
  declarada del alumno es "no sé qué hacer en el medio juego", y la app le está mostrando la
  evidencia de eso mismo con la etiqueta equivocada.
- **Problema:** un alumno que lee su propio diagnóstico y ve "78 % de mis errores graves son en
  finales" toma una decisión de estudio equivocada. El ciclo de 8 semanas tiene dos semanas de
  finales (rey y peón, torre); esta pantalla le diría que las priorice por encima de "encontrar
  un plan" y "seguridad y amenazas", que es lo contrario de lo que necesita.
- **Impacto en el alumno:** semanas de estudio mal asignadas, y peor: la confirmación falsa de
  que su medio juego está bien (solo 10 errores graves en 112 jugadas).
- **Propuesta concreta:** redefinir el final con un criterio estándar de material, no con un
  conteo que arranca ya casi cumplido. Lo que usa cualquier manual: damas fuera, o material no
  peón por bando bajo un umbral bajo (≈13 puntos contando D=9, T=5, A/C=3 — la convención de
  Lichess). Y el piso de apertura de 20 plies debería ceder al final de libro real, no
  imponerse sobre él. **Recalcular `moves.phase` para todo el histórico**, porque tres pantallas
  (`/errores`, `/reloj`, `/partida`) leen esa columna.
- **Otras visiones que toca:** BI (recálculo masivo de `moves.phase`, y todas las vistas por fase
  cambian de forma), UX (los textos de las tres pantallas hoy describen la distribución rota).
- **Impacto:** **alto** · **Esfuerzo:** M (la función es de 10 líneas; el backfill es el trabajo)

---

### PED-03 | "Tu plan de hoy: 397 ejercicios vencidos, ~397 min"

- **Evidencia:** `capturas/portada-390.png`, tarjeta "TU PLAN DE HOY". `app/page.tsx:205-214`
  renderiza `~${Math.round(vencidos)} min`. Inventario §3.10: **397 de 400 ejercicios vencidos**,
  265 intentos con **6 aciertos**. `lib/spaced-repetition/sm2.ts:33-38`: al fallar,
  `dueAt = now` e `intervalDays = 0`, o sea vuelve a vencer inmediatamente.
- **Hecho:** el plan del día que la app propone son seis horas y media de ejercicios, y la
  mecánica garantiza que la cola nunca baje: con 2,3 % de acierto, cada sesión devuelve casi
  todo a "vencido hoy".
- **Opinión:** Chessable documenta esto como la falla típica de la repetición espaciada (ver
  benchmark). Aquí está en su forma extrema, y además en la **primera** pantalla.
- **Problema:** una deuda visible e imposible no enseña; desmotiva y empuja a cerrar la app. Y
  como la otra tarea del día ("jugar 2 partidas de rápida") comparte tarjeta con esta, el
  mensaje neto es "vas 0/2 y te faltan 6 horas".
- **Impacto en el alumno:** la tarea que debería ser el hábito diario más fácil de cumplir
  (5 ejercicios sobre sus propios errores) se presenta como impagable. Es la forma más rápida de
  que deje de abrir el entrenador.
- **Propuesta concreta:**
  1. El plan del día es una **sesión acotada de tamaño fijo** —10 ejercicios— elegida de la cola,
     no la cola. La portada dice "10 ejercicios de hoy", nunca 397.
  2. El backlog completo no se muestra en la portada. Si se quiere, va en el entrenador, chico.
  3. La estimación en minutos sale de los intentos reales (`puzzle_attempts.attempted_at`), no de
     "1 minuto por ejercicio".
  4. Al fallar, el ejercicio no vuelve a vencer hoy mismo: mínimo al día siguiente. Reintentar
     dentro de la sesión ya existe y es lo correcto; reprogramarlo para dentro de un minuto es
     lo que construyó la deuda.
- **Otras visiones que toca:** UX (jerarquía y copy de la tarjeta), BI (una selección de sesión,
  no un `order by due_at limit 1`).
- **Impacto:** **alto** · **Esfuerzo:** S

---

### PED-04 | El diagnóstico se calcula sobre 108 partidas y declara 1.782

- **Evidencia:** `capturas/errores-390.png`: "Basado en **1.782 de 10.106** partidas analizadas".
  `app/errores/page.tsx:31` fija `CLASE = 'rapid'`; `:46-47` suma `cobertura.reduce` sobre
  **todas** las clases. Inventario §3.3 y §3.4: rápida tiene **108** analizadas, 1.074 pendientes
  y **1.406 marcadas `skipped`** siendo partidas normales de 10 minutos con todas sus jugadas y
  todos sus relojes extraídos. `lib/analysis/store.ts:71` ordena por
  `(time_class in ('rapid','blitz')) desc, end_time desc`, y como el histórico reciente es blitz,
  el motor consumió 1.674 de blitz contra 108 de rápida.
- **Hecho:** la página que responde "dónde cuelgo piezas" habla con 108 partidas y declara una
  base 16 veces mayor. 1.406 partidas de rápida están excluidas del motor para siempre sin que
  ningún chequeo lo note: `v_analysis_coverage` no cuenta las `skipped` en ningún lado, y los 10
  chequeos de `v_data_quality` están en verde.
- **Opinión:** los 108 no alcanzan para ninguna de las conclusiones que la página presenta. Con
  108 partidas y el corte por fase y por bucket de tiempo, celdas como "rapid · medio juego"
  quedan en 112 jugadas; el proyecto tiene una regla explícita de n≥20 para partidas y no la
  aplica a las jugadas de estos cortes.
- **Problema:** el alumno cree que su diagnóstico está hecho sobre 1.782 partidas. Es su
  pantalla de auditoría de errores, la semana 8 de su ciclo.
- **Impacto en el alumno:** conclusiones frágiles presentadas con autoridad, sobre la pregunta
  que más le importa. Y 1.406 partidas de rápida —el 54 % de su rápida— invisibles.
- **Propuesta concreta:**
  1. La cobertura que declara `/errores` debe ser la de la clase que filtra: "108 de 2.588 de
     rápida". Una página nunca declara una base que no usó.
  2. Devolver las 1.406 `skipped` de rápida a `pending` y arreglar el orden de la cola para que
     rápida vaya **antes** que blitz, no empatada.
  3. Un chequeo nuevo en `v_data_quality`: partidas con `moves` completas y reloj marcadas
     `skipped`. Hoy el silencio es total.
- **Otras visiones que toca:** BI (cola de análisis, `v_analysis_coverage`, chequeo nuevo),
  UX (el texto de cobertura de `/errores` y `/aperturas`).
- **Impacto:** **alto** · **Esfuerzo:** M

---

### PED-05 | El ciclo detecta, explica y practica. No verifica.

- **Evidencia:** el ciclo es detectar → entender → practicar → **verificar que dejó de
  repetirse**. Los tres primeros existen y son buenos: `/errores` + `/partida` detectan,
  `lib/puzzles/explain.ts` y `lib/puzzles/diagnostico.ts` explican de forma determinista,
  `/entrenador` practica. El cuarto no existe en ninguna parte:
  - `games.blunders`, `games.mistakes`, `games.inaccuracies` existen por partida desde
    `0001_init.sql:93-95` y **ninguna vista ni página los grafica en el tiempo**. Lista de vistas
    en `supabase/migrations/`: ninguna de las 23 es una serie temporal de error.
  - El panel del entrenador cuenta el **historial completo**, y está documentado como decisión:
    `lib/data.ts:256` — "un error que ya corregiste sigue apareciendo".
  - El bloque "Estás mejorando" de la portada es un `PendienteDeDatos` fijo
    (`app/page.tsx:252`), justo donde iría esto.
- **Hecho:** hoy no hay forma de responder "¿dejé de colgar piezas?". Ni en la app, ni en la
  base con las vistas que existen.
- **Opinión:** este es el eslabón que separa una app de análisis de una app de entrenamiento.
  Sin él, el alumno entrena a ciegas: puede resolver 200 ejercicios de pieza colgada y no saber
  si sigue colgando piezas en partida. Y es lo que convierte la semana 8 del ciclo ("auditoría de
  errores") en algo que se puede hacer de verdad.
- **Problema:** el sistema mide cuánto entrenó, no si el entrenamiento sirvió.
- **Impacto en el alumno:** sin señal de mejora, la motivación depende del rating, que es ruidoso
  y en su caso está bajando por razones ajenas (dejó la rápida). Un contador de blunders por
  partida que baja de 1,4 a 0,9 en dos meses es una razón para seguir; el rating no se la da.
- **Propuesta concreta:** una serie temporal, mes a mes y solo de rápida, de **blunders por
  partida** y **piezas colgadas por partida**, con su `n` y su banda. Va en el bloque "Estás
  mejorando" de la portada, en una línea, no en una pantalla nueva. Es la única métrica de
  progreso que el alumno debería mirar además de su rating de rápida. Requiere PED-04 resuelto
  (con 108 partidas analizadas repartidas en 23 meses no hay serie).
- **Otras visiones que toca:** BI (vista nueva sobre `games.blunders` por mes y clase),
  UX (llenar el bloque que ya está armado).
- **Impacto:** **alto** · **Esfuerzo:** M

---

### PED-06 | El ritual "primero sin motor" no está soportado, y `/partida` lo rompe al abrir

- **Evidencia:** `capturas/partida-390.png`. Al abrir la partida, sin tocar nada, ya se ve:
  precisión 85,8 %, "GRAVES 1", el `EvalChart` con los dos puntos rojos, la lista de jugadas con
  evaluación numérica en cada línea (`+0.3`, `+1.7`, `-4.4`) y el badge `??` sobre `Nxf7`, y
  "Momentos clave" diciendo "Tu peor jugada fue Nxf7 en la apertura: costó 6.9 puntos (el motor
  jugaba e4c3)". El único elemento apagado por defecto es el panel del motor interactivo
  ("El motor está apagado. Enciéndelo…"). Búsqueda en `app/`, `components/`, `lib/`: no existe
  ninguna noción de autoanálisis, modo sin motor, ocultar evaluación ni veredicto propio.
  Inventario §4: "Autoanálisis previo al motor — no existe en ninguna fuente: hay que capturarlo".
- **Hecho:** la app entrega el veredicto del motor antes de que el alumno mire la posición, en la
  misma pantalla y sin pedirlo. El apagado del motor interactivo no protege nada: las
  evaluaciones por lotes ya están escritas en `moves` y se dibujan.
- **Opinión:** el ritual "toda derrota se analiza primero sin motor" es, de todo el plan
  declarado, lo que más lo va a subir de 1250 a 1500. Es donde se entrena buscar candidatas,
  evaluar y decidir sin muleta. La app hoy hace ese ritual más difícil que no tenerla: en
  chess.com puede al menos no apretar "Game Review".
- **Problema:** no hay un modo en que la pantalla sirva al ritual, y no hay dónde guardar lo que
  el alumno concluyó por su cuenta.
- **Impacto en el alumno:** o abandona el ritual (lo más probable, porque la app es más cómoda),
  o deja de usar `/partida` para sus derrotas, que es su mejor pantalla.
- **Propuesta concreta:** un modo **"Primero yo"** en `/partida`, que sea el modo por defecto
  cuando la partida es una derrota:
  1. Se ocultan evaluaciones, clasificaciones, gráfico, precisión y momentos clave. Queda el
     tablero, las jugadas en SAN, los relojes y la navegación.
  2. El alumno marca en la lista **la jugada donde cree que se perdió la partida** y escribe una
     línea de por qué. Un solo campo de texto y un ply. Nada más.
  3. Al confirmar, se revela todo lo del motor **y se compara**: "marcaste la jugada 14; el motor
     dice que fue la 8". Ese contraste es el ejercicio.
  4. Lo guardado (`ply` marcado + texto + `ply` del motor) es el material de la semana 8 del
     ciclo, y el registro de que esa derrota **sí se analizó** (ver PED-07).
- **Otras visiones que toca:** UX (es un cambio de flujo, no de estética), BI (tabla nueva de
  autoanálisis, la única escritura de contenido propio de la app).
- **Impacto:** **alto** · **Esfuerzo:** M

---

### PED-07 | No hay ninguna cola de "derrotas de rápida sin revisar"

- **Evidencia:** `lib/data.ts:322-343` (`listGames`) selecciona 15 columnas de `games`: ninguna
  es un estado de revisión, y no existe tal columna en `0001_init.sql`.
  `capturas/registro-390.png` muestra las 30 partidas más recientes, todas `2+1`, en ráfagas de
  minutos el 15-09-26; la columna de resultado ni siquiera entra en el ancho de celular. La única
  acción por fila es "Analizar" → `/partida/{id}` (`app/registro/page.tsx:184`).
- **Hecho:** la app no sabe qué derrotas ya revisó el alumno. La regla declarada "toda derrota se
  analiza" no tiene soporte de ningún tipo.
- **Opinión:** es el compromiso más concreto del plan de entrenamiento y el más fácil de romper
  sin darse cuenta. Un hábito que no se registra no se sostiene, y este además es barato de
  registrar: PED-06 ya produce el evento.
- **Problema:** el ciclo de aprendizaje no tiene entrada. Hoy el camino "perdí → reviso" depende
  de que el alumno se acuerde, abra `/registro`, filtre por perdidas, elija una y la abra. Son
  cuatro decisiones antes del primer tablero. Lichess lo hace en un tap desde el informe
  ("Learn from your mistakes", benchmark).
- **Impacto en el alumno:** el ritual se cumple cuando hay ganas, no siempre, y nadie lo nota.
- **Propuesta concreta:**
  1. Marcar la derrota como revisada es la consecuencia de terminar el modo "Primero yo"
     (PED-06). No un checkbox aparte.
  2. La portada reemplaza uno de sus dos bloques vacíos por **"Derrotas de rápida sin revisar"**,
     con las tres más recientes y un link directo. Máximo tres: si son 40, se muestran tres y se
     dice "y 37 más", nunca la deuda completa (misma lección que PED-03).
  3. En `/registro`, un filtro "sin revisar" al lado de los que ya existen, y la fila de una
     derrota no revisada de rápida se distingue. Solo rápida: revisar bala no está en el plan.
- **Otras visiones que toca:** UX (bloque de portada y filtro), BI (columna/tabla de revisión).
- **Impacto:** **alto** · **Esfuerzo:** M

---

### PED-08 | `/errores` hace la pregunta, tiene la respuesta, y no la dice. Y la respuesta es "no".

- **Evidencia:** `app/errores/page.tsx:133` titula el panel "¿Los errores se concentran en las
  jugadas rápidas?" y dibuja `columnasTiempo`. Inventario §3.7, rápida: `<3s` → **3,4 %** de
  error; `3-10s` → 8,4 %; `10-30s` → 8,6 %; `>30s` → **18,4 %**. En blitz, la misma escalera
  (4,5 % → 20,4 %). `capturas/errores-390.png` muestra la escalera ascendente. En ninguna parte
  de la página hay una frase con la conclusión.
- **Hecho:** la tasa de error es **5 veces mayor** en las jugadas que más piensa que en las
  instantáneas, de forma monótona y en las dos clases. La pregunta 4 del proyecto ya está
  respondida y la respuesta es que no.
- **Opinión (hipótesis de entrenador, no causalidad):** pensar mucho correlaciona con posiciones
  difíciles, así que esto no prueba que pensar lo perjudique. Lo que sí desmiente es la hipótesis
  del proyecto, y lo que sugiere es mucho más útil para él: **reconoce los momentos críticos
  —por eso les da tiempo— y aun así no los resuelve**. Eso no es un problema de apuro. Es un
  problema de método de cálculo: candidatas, verificación de capturas y jaques, y "¿qué amenaza
  su última jugada?". Es exactamente la semana 1 de su ciclo (seguridad y amenazas) y la semana 3
  (encontrar un plan), y le dice que la semana de gestión del reloj no le urge.
- **Problema:** la app dibuja el hallazgo y deja la interpretación al alumno, que es quien menos
  puede hacerla.
- **Impacto en el alumno:** el hallazgo más accionable de todo el proyecto está en pantalla y
  no se lee. Y en la partida de ejemplo ocurre otra vez: el propio "Momentos clave" dice
  "Donde más pensaste fue en Nxf7 (67.3s) — y aun así fue un error grave", y ahí tampoco cierra
  la idea.
- **Propuesta concreta:** cada panel de `/errores` termina con **una frase de conclusión** escrita
  por la app, derivada del dato y con su `n`, no un párrafo de ayuda. Por ejemplo: "No. Tu tasa de
  error sube de 3,4 % a 18,4 % con el tiempo que le dedicas. Los errores no vienen de jugar
  rápido, vienen de las posiciones que ya identificaste como difíciles." Y la misma regla para
  el resto de la app: **todo panel que se titula con una pregunta se cierra con su respuesta.**
- **Otras visiones que toca:** UX (el patrón "pregunta → respuesta" vale para toda la app),
  BI (la conclusión es una regla sobre las filas, no texto fijo).
- **Impacto:** **alto** · **Esfuerzo:** S

---

### PED-09 | `/aperturas` mezcla bala, blitz y rápida: el gráfico no es su repertorio

- **Evidencia:** `app/aperturas/page.tsx:71-81` (`peores`) filtra por color y `n>=20`, y **no**
  por `time_class`; la clase solo aparece en el `title` del tooltip (`:80`) y como `Badge` en la
  tabla (`:165`). `capturas/aperturas-390.png`, "Con blancas": Caro-Kann 17 %, Four Knights 19 %,
  Modern 20 %, Caro-Kann 22 %, French 22 %, French 23 %, Scandinavian 30 %, Scandinavian 30 %.
  Inventario §3.9, rápida con n≥20: Ponziani 165 partidas 0,579; Ponziani Jaenisch 131 partidas
  0,630; Philidor 72 partidas 0,458.
- **Hecho:** ninguna de las ocho barras del gráfico "Con blancas" coincide con las filas de rápida
  del inventario. El gráfico está mostrando bala y blitz, donde tiene el 80 % de sus partidas.
- **Opinión:** decirle a un jugador de 1250 que "pierde contra la Caro-Kann" cuando eso se midió
  en partidas de 2+1 es la peor clase de consejo de apertura: lo manda a estudiar teoría para
  arreglar un problema que es de tiempo.
- **Problema:** la pregunta 1 del proyecto ("contra qué aperturas pierdo") está respondida sobre
  una población que el propio proyecto declaró no comparable —`/errores` ya filtra a rápida por
  esa razón exacta, documentada en `app/errores/page.tsx:40-43`—. La misma regla no se aplicó
  aquí.
- **Impacto en el alumno:** una lista de tareas de apertura falsa, y la invisibilidad de la buena
  noticia: su repertorio con blancas funciona (296 partidas de rápida rindiendo 0,58-0,63).
- **Propuesta concreta:** `/aperturas` filtra a **rápida** por defecto, con la misma justificación
  escrita que `/errores`. Si se quiere ver otra clase, un filtro por URL como los de `/registro`.
  Y la conclusión escrita (PED-08): "Con blancas tu repertorio rinde bien. Tus peores resultados
  con blancas son contra la Philidor (0,46 en 72) y la Old Sicilian (0,45 en 41)."
- **Otras visiones que toca:** UX (filtro por clase, consistencia con `/errores`), BI (ninguna:
  `v_opening_performance` ya agrupa por `time_class`).
- **Impacto:** **alto** · **Esfuerzo:** S

---

### PED-10 | El entrenador sirve el ejercicio más viejo, no el que corresponde

- **Evidencia:** `lib/data.ts:208-218` (`nextDuePuzzle`): `order('due_at', ascending)`, `limit 1`.
  No hay criterio de tema, dificultad, recencia de la partida ni relación con el diagnóstico.
  `lib/puzzles/store.ts:72-82` construye candidatos con `order by g.end_time desc` sin filtrar
  clase. Inventario §3.10: **solo 16 de 400 ejercicios vienen de partidas de rápida**; 121 son
  `pieza_colgada`, 203 sin `theme`.
- **Hecho:** el ejercicio que abre el entrenador es, casi con certeza, un blunder de una partida
  de blitz o bala vieja. No tiene relación con la derrota de ayer, con el tema de la semana, ni
  con lo que `/errores` acaba de decir.
- **Opinión:** es el eslabón suelto que el benchmark identifica en los tres referentes que
  cierran el lazo (Lichess mistakes→puzzle, Aimchess debilidad→módulo, Chessable error→repaso).
  Chessito tiene los dos extremos construidos y de buena calidad, y nadie los une.
- **Problema:** entrenar sin dirección. El alumno resuelve lo que la cola le da, y la cola está
  ordenada por antigüedad de vencimiento, que es una propiedad del calendario, no del
  aprendizaje.
- **Impacto en el alumno:** el entrenamiento no responde a nada de lo que la app diagnosticó.
  Es un banco de puzzles con sus posiciones, no un entrenador.
- **Propuesta concreta:** la sesión de 10 ejercicios de PED-03 se arma con prioridad explícita,
  no por `due_at`:
  1. Primero, los ejercicios de las **derrotas de rápida de los últimos 7 días**. Es el camino
     derrota → ejercicio, en el mismo día en que duele.
  2. Después, los del **tema de la semana** (PED-11), si hay.
  3. Después, la cola de repaso normal por `due_at`.
  Y desde `/partida`, tras el modo "Primero yo", un botón "Entrenar los 3 errores de esta
  partida" — el link por posición ya existe (`?partida=&ply=`, `app/entrenador/page.tsx:60-64`),
  falta el que sirve la tanda.
- **Otras visiones que toca:** BI (la selección de sesión), UX (el botón de cierre de `/partida`).
- **Impacto:** **alto** · **Esfuerzo:** M

---

### PED-11 | El ciclo de 8 semanas no existe en la app

- **Evidencia:** búsqueda en el repo: no hay tabla, vista, página ni campo relacionado con tema de
  la semana, plan o rutina. Inventario §4 lo lista como dato que "no existe" y §8 confirma que
  `PLAN.md` tampoco lo contempla. Los 3 `theme` implementados (`pieza_colgada`, `mate_pasillo`,
  `permite_horquilla`, `lib/chess/theme.ts`) no se cruzan con ninguna noción de currículum.
- **Hecho:** el alumno tiene un plan de 8 semanas con temas nombrados y la app no lo sabe.
- **Opinión:** no hay que construir un curso. Basta que la app sepa **en qué semana está** y que
  eso ordene una cola que ya existe. Es la diferencia entre "entrenar" y "entrenar seguridad y
  amenazas esta semana", que es lo que el benchmark señala de los módulos con nombre de Aimchess:
  nombrar el módulo nombra la habilidad.
- **Problema:** las dos mitades del entrenamiento del alumno —lo que estudia fuera y lo que la
  app le sirve— corren en paralelo sin tocarse.
- **Impacto en el alumno:** la app no puede ayudarlo con la semana que está cursando, ni decirle
  al final de la semana si mejoró en ese tema, que es lo único que cierra una semana de estudio.
- **Propuesta concreta:** un único campo de configuración —el tema de la semana en curso, elegido
  de una lista fija de 8— que haga tres cosas y ninguna más:
  1. Ordena la cola de ejercicios (PED-10, prioridad 2).
  2. Da el título de una línea en la portada: "Semana 1 · seguridad y amenazas".
  3. Al cerrar la semana, la única pregunta que importa: los blunders por partida de ese tipo,
     esta semana contra el promedio de las cuatro anteriores (usa PED-05).
  El mapeo tema → `theme`/`concepto` no es perfecto y no hace falta que lo sea: "seguridad y
  amenazas" cubre `pieza_colgada`, `cuelga_la_pieza_movida`, `abandonas_la_defensa`,
  `no_atiendes_la_amenaza` — que ya existen en `puzzle_attempts.concepto`.
  **Sin racha, sin porcentaje de cumplimiento, sin notificaciones.** Una línea que dice qué semana
  es, y una cola ordenada.
- **Otras visiones que toca:** BI (mapeo tema → conceptos), UX (una línea, no una pantalla).
- **Impacto:** **medio-alto** · **Esfuerzo:** M

---

### PED-12 | Los ejercicios son casi imposibles y son todos del mismo tipo

- **Evidencia:** inventario §3.10: 265 intentos, **6 correctos** (2,3 %). `lib/puzzles/store.ts:75`
  toma candidatos con `m.classification = 3` únicamente, o sea solo caídas de win% ≥ 30
  (`lib/analysis/classify.ts:9`). Los errores de clase 2 (20-30 %) y las imprecisiones no generan
  ejercicio. `capturas/entrenador-390.png`: el ejercicio servido es una posición de medio juego
  con 20 piezas en tablero, etiquetada "Permite horquilla". Criterio de aceptación de `PLAN.md`
  Fase 4 ("resolver 10 seguidos sin que ninguno sea injusto"): sin verificar.
- **Hecho:** 2,3 % de acierto al primer intento. No puedo verificar si es porque los ejercicios
  son injustos o porque el alumno falla, pero sé que ninguna de las dos explicaciones deja el
  sistema en un estado sano.
- **Opinión:** un set de ejercicios calibrado para aprender debería andar entre 50 % y 80 % de
  acierto al primer intento. Por debajo de 20 %, el alumno deja de calcular y empieza a adivinar,
  y la repetición espaciada deja de significar algo (todo se reprograma para hoy, PED-03). Dos
  causas probables y ambas atacables: (a) la posición del ejercicio es la del blunder, con el
  tablero lleno y sin pista de qué mirar — es más difícil que un puzzle de Lichess del mismo
  motivo; (b) solo hay blunders graves, que en un 1250 suelen ser errores de varias jugadas de
  profundidad, no de una.
- **Problema:** el entrenador entrena un solo tipo de error (perder material de golpe) y lo hace
  al nivel más difícil posible.
- **Impacto en el alumno:** frustración medible, y ninguna práctica sobre su otra debilidad
  declarada, el medio juego, que casi nunca produce un blunder de clase 3.
- **Propuesta concreta:**
  1. Incluir `classification = 2` como candidato, etiquetado como tal. Son errores más chicos y
     más frecuentes, y para un 1250 son los que más se repiten.
  2. Medir la dificultad real: con `puzzle_attempts` ya se puede calcular la tasa de acierto por
     ejercicio. Los que nadie acierta nunca no son ejercicios, son posiciones perdidas; sacarlos
     de la cola en vez de volver a servirlos cada día.
  3. Verificar de una vez el criterio de `PLAN.md`: resolver 10 seguidos y anotar cuántos fueron
     injustos. Es media hora de trabajo manual y ahorra meses de suposiciones.
- **Otras visiones que toca:** BI (tasa de acierto por ejercicio, umbral de descarte),
  UX (etiquetar la severidad del ejercicio).
- **Impacto:** **medio-alto** · **Esfuerzo:** M

---

### PED-13 | Falta la métrica que nombra su debilidad #1: piezas colgadas por partida

- **Evidencia:** la debilidad declarada es "cuelga piezas". Lo que la app ofrece hoy: `theme`
  `pieza_colgada` en 121 ejercicios (inventario §3.10) y `concepto` `pieza_colgada` en el panel
  del entrenador, ambos como **conteos de ejercicios e intentos**, no como tasa por partida. No
  hay ninguna vista que responda "cuántas piezas colgué por partida de rápida este mes".
  `lib/puzzles/diagnostico.ts` ya distingue `cuelga_la_pieza_movida`, `abandonas_la_defensa`,
  `no_atiendes_la_amenaza` — la taxonomía fina existe y solo se usa dentro del entrenador.
- **Hecho:** la debilidad principal del alumno no tiene una métrica de seguimiento en la app.
- **Opinión:** "piezas colgadas por partida de rápida" es la métrica más importante que esta app
  puede darle, y es la única que él entendería sin explicación. Es el numerador de su plan de
  estudio y el denominador de su progreso. Hoy tiene precisión, ACPL, peones perdidos, tasa de
  error por bucket de tiempo y Wilson por apertura, y no tiene esa.
- **Problema:** el diagnóstico está expresado en el vocabulario del motor (cp_loss, win%,
  clasificación) y no en el del error humano.
- **Impacto en el alumno:** no puede saber si su debilidad declarada está mejorando, ni ponerse
  una meta sobre ella.
- **Propuesta concreta:** promover la taxonomía de `lib/puzzles/diagnostico.ts` desde el
  entrenador hasta el análisis: al analizar una partida, además de `classification` y `cp_loss`,
  guardar el **concepto del error** de cada blunder de Gabriel. Con eso se pueden responder las
  dos preguntas que hoy no se pueden: "cuántas piezas colgué por partida" y "está bajando".
  Un solo número en la portada, al lado del rating de rápida. Nada más.
- **Otras visiones que toca:** BI (columna nueva en `moves` o tabla derivada, y su vista mensual),
  UX (una línea en la portada).
- **Impacto:** **medio-alto** · **Esfuerzo:** L

---

### PED-14 | Falta la métrica que nombra su debilidad #2: conversión de ventaja

- **Evidencia:** la segunda debilidad declarada es "no sé qué hacer en el medio juego". Ninguna
  pantalla la aborda. Los datos para hacerlo están: `moves.eval_cp` normalizado a blancas,
  `moves.is_mine`, `games.result`. El benchmark lo señala con nombre (Aimchess "Advantage
  Capitalization"; Lichess "Opportunism").
- **Hecho:** la app mide errores, no oportunidades. Evalúa solo las jugadas de Gabriel y solo
  para castigarlas.
- **Opinión:** "no sé qué hacer en el medio juego" no se mide con una tasa de blunder. Se mide
  con **qué pasa cuando la posición está bien**: cuántas veces llegó a +2 y no ganó, cuántas
  veces el rival le colgó algo y no lo tomó. Esa es la traducción operativa de su queja, y es la
  única métrica que apunta a la parte positiva del juego en toda la app. Para un jugador de 1250,
  "te ganaron 11 de las 30 partidas en las que ibas ganando por una pieza" es más útil y más
  motivador que cualquier tasa de error.
- **Problema:** el alumno tiene una queja concreta y la app no tiene ni un número que la toque.
- **Impacto en el alumno:** la mitad de su diagnóstico personal es invisible para la herramienta
  que construyó para diagnosticarse.
- **Propuesta concreta:** un solo indicador, con nombre, en `/errores` o en la portada:
  **"Partidas en las que llegaste a +200 y no ganaste"**, con su `n` y la lista enlazada a
  `/partida`. Esas partidas son, además, el mejor material de revisión que tiene: en ellas el
  error no fue táctico, y ahí es donde se aprende plan. Un segundo indicador, más barato de lo que
  parece porque `moves` ya tiene todas las evaluaciones: **blunders del rival que no castigó**
  (la evaluación sube a su favor y su jugada siguiente la devuelve).
- **Otras visiones que toca:** BI (vista nueva sobre `moves.eval_cp` por partida), UX (un bloque).
- **Impacto:** **medio-alto** · **Esfuerzo:** M

---

### PED-15 | El panel "los errores que más has repetido" está vacío por construcción y muestra 0 % en todo

- **Evidencia:** `capturas/entrenador-390.png`: "Empeorar la posición 170 veces · **0 %**",
  "Dejar una pieza colgada 44 veces · **0 %**", "Permitir una horquilla 16 veces · **0 %**".
  Inventario §3.10 y §6.2(e): los 170 intentos vienen de **3 ejercicios**
  (`v_conceptos_fallados_rapida.ejercicios = 3`). La vista filtra `g.time_class = 'rapid'`
  (`0010:28`) y solo 16 de 400 ejercicios vienen de rápida.
- **Hecho:** el panel cruza dos poblaciones incompatibles por diseño: el diagnóstico cuenta solo
  rápida y los ejercicios se construyen desde todas las clases. El resultado es un panel de tres
  líneas, las tres en 0 %, sobre 3 ejercicios.
- **Opinión:** la decisión de la Fase 12 (diagnosticar solo con rápida, entrenar con todo) es
  pedagógicamente correcta y la defiendo. Lo que falla es aplicarla a un panel que mide los
  **intentos**, que ocurren en el entrenador y por tanto vienen de todas las clases. Además
  `empeora_la_posicion` se lleva el 74 % de los intentos y es el cajón de "ninguno de los otros":
  tres cuartos del panel no nombran ningún patrón.
- **Problema:** el panel que debería decirle en qué error tropieza más le dice que nunca acierta
  nada, sobre una muestra de 3.
- **Impacto en el alumno:** desmoralizante y falso. Un 0 % repetido tres veces en la pantalla de
  entrenamiento es peor que no mostrar el panel.
- **Propuesta concreta:**
  1. El panel cuenta los intentos de **todos** los ejercicios (que es donde ocurren), y el corte
     por clase de tiempo se mantiene donde corresponde: en `/errores`, que mide partidas.
  2. Ocultar el panel completo bajo un mínimo de ejercicios distintos (5, digamos). Es la misma
     regla del n≥20 que el proyecto ya respeta en todas partes y que aquí no se aplicó.
  3. `empeora_la_posicion` no se muestra como si fuera un patrón: es el residuo. O se agrupa
     aparte ("sin patrón reconocido"), o no aparece.
- **Otras visiones que toca:** BI (`v_conceptos_fallados_rapida` vs `v_conceptos_fallados`),
  UX (umbral de ocultamiento, tratamiento del residuo).
- **Impacto:** **medio** · **Esfuerzo:** S

---

### PED-16 | No existe el repertorio como concepto, y es lo que él estudia

- **Evidencia:** inventario §3.9: el Ponziani aparece partido en "Ponziani Opening" (165) y
  "Ponziani: Jaenisch Counterattack" (131); no hay forma de preguntar "cómo me va con mi
  repertorio" ni "qué me juegan contra el Ponziani". El esquema no tiene nada de repertorio
  (`0001_init.sql`: `openings` es nombre + ECO + EPD + `ply_count`).
  `capturas/partida-390.png`: la partida de ejemplo es **Pirc Defense**, o sea 1.e4 d6 — su rival
  ni siquiera lo dejó llegar al Ponziani, y la app no lo dice.
- **Hecho:** la app agrupa por la apertura que ocurrió, no por la que él pretendía jugar. Son
  cosas distintas y la segunda es la que se estudia.
- **Opinión:** para un jugador con repertorio declarado, las dos preguntas que importan son
  "¿cuántas veces llegué a mi línea?" y "¿qué me juegan cuando me sacan de ella?". La app tiene
  todo el material (`divergence_ply`, el EPD de cada ply, `opening_id`) y responde una tercera
  pregunta que no es ninguna de las dos.
- **Problema:** la semana 7 del ciclo es "repertorio" y no hay nada en la app que la sirva.
- **Impacto en el alumno:** estudia repertorio sin saber cuánto de su repertorio llega a jugarse,
  ni contra qué respuestas está perdiendo de verdad.
- **Propuesta concreta:** declarar el repertorio como una lista corta de líneas —tres entradas:
  Ponziani con blancas, 1...e5 contra 1.e4, d5/Cf6/e6 contra 1.d4—, y con eso dos números en
  `/aperturas`: **"llegaste a tu repertorio en X de N partidas de rápida"** y, para las que no,
  **qué te jugaron** (agrupado por la respuesta del rival en la jugada 1-3). No es un árbol de
  aperturas ni un explorador; son dos cortes sobre datos que ya existen.
- **Otras visiones que toca:** BI (definición del repertorio y su resolución por EPD),
  UX (dos bloques en `/aperturas`).
- **Impacto:** **medio** · **Esfuerzo:** M

---

### PED-17 | `/ritmo` es una pantalla entera cuya respuesta medida es "no hay efecto"

- **Evidencia:** inventario §3.8, rápida: tras ganar 0,535 (Wilson 0,503), tras perder 0,511
  (Wilson 0,479), tras empatar 0,528 (Wilson 0,397). Por índice de sesión, de la 1 a la 6+:
  0,535 / 0,512 / 0,512 / 0,504 / 0,578 / 0,528. Todos los intervalos se solapan por completo.
  `capturas/ritmo-390.png` lo muestra sin ambigüedad: en "Fatiga", seis barras de la misma altura;
  en "Tilt", tres barras iguales por cada clase.
- **Hecho:** dos de las tres preguntas de `/ritmo` tienen respuesta y la respuesta es que no hay
  efecto. La página no lo dice. La tercera (hora del día) sí tiene algo de señal: 11h y 20h
  rinden 0,61; las 13h rinden 0,45 con n=213.
- **Opinión:** que un análisis dé "no hay efecto" es un resultado válido y honesto, y decirlo en
  una línea vale más que tres gráficos. Mantener la pantalla sin la conclusión invita a leer
  ruido: seis barras que difieren en 2 puntos porcentuales se ven como una tendencia.
- **Problema:** una de las cuatro preguntas fundacionales del proyecto está respondida en
  negativo y el proyecto sigue dedicándole una de nueve pantallas.
- **Impacto en el alumno:** ninguno directo; el daño es de oportunidad y de credibilidad. Y el
  riesgo de que actúe sobre un patrón inexistente ("no juego tras perder").
- **Propuesta concreta:** `/ritmo` se reduce a lo que tiene señal —la hora del día, con su
  conclusión escrita: "juegas peor a las 13h (0,45 en 213) y mejor a las 11h y 20h"— y los otros
  dos gráficos se reemplazan por una línea: "Tilt y fatiga: medido sobre N partidas de rápida, no
  hay efecto; los intervalos se solapan por completo." Lo que se libera es espacio en la barra
  lateral para algo que sí cambie una decisión (PED-07 o PED-14). No borrar los datos: la regla
  del proyecto es que un dato se quita cuando se puede demostrar que no significa nada, y aquí se
  puede — pero se deja dicho, no en silencio.
- **Otras visiones que toca:** UX (una pantalla menos en la navegación), BI (nada; las vistas
  quedan).
- **Impacto:** **medio** · **Esfuerzo:** S

---

### PED-18 | El entrenador explica muy bien, pero nunca pregunta por qué

- **Evidencia:** `lib/puzzles/explain.ts` (312 líneas) y `lib/puzzles/diagnostico.ts` (348 líneas)
  producen un diagnóstico determinista de calidad —"moviste la torre que defendía el caballo, y
  te lo comen con Cxd4", con la jugada que no vio, las jugadas hasta el golpe, la pieza perdida y
  si abandonó la defensa—. El benchmark lo marca como ventaja real sobre DecodeChess. Ese texto
  se entrega **después** de resolver, como lectura. El único input que el ejercicio pide es una
  jugada.
- **Hecho:** el alumno interactúa con el entrenador moviendo una pieza; el "por qué" lo recibe
  escrito.
- **Opinión:** es el paso "entender" del ciclo, y hoy es pasivo. Lo que fija un patrón no es leer
  "dejaste una pieza colgada", es **haberlo dicho uno antes de que la app lo confirme** —es el
  mismo mecanismo del contraste de PED-06, aplicado al ejercicio—. Y el material para preguntarlo
  ya está: los conceptos de `diagnostico.ts` son un conjunto cerrado y corto.
- **Problema:** el mejor activo pedagógico del código se usa en el modo menos efectivo.
- **Impacto en el alumno:** resuelve ejercicios sin nombrar el patrón, que es justo lo que hay
  que transferir a la partida.
- **Propuesta concreta:** al **fallar** un ejercicio (solo al fallar, no siempre, para no alargar
  el que ya salió bien), una pregunta de una sola pulsación antes de revelar: "¿qué pasó?" con
  tres o cuatro opciones tomadas de los conceptos reales. Se guarda la respuesta en
  `puzzle_attempts` junto al `concepto` que ya se guarda, y con eso aparece la métrica que hoy no
  existe: **no solo qué error comete, sino cuáles reconoce**. Un error que comete y reconoce se
  corrige con práctica; uno que comete y no reconoce necesita estudio. Son dos tratamientos
  distintos y hoy no se distinguen.
  *Filtro de riesgo:* agrega un tap por ejercicio fallado, no una pantalla nueva. Pasa.
- **Otras visiones que toca:** UX (un paso más en el flujo del fallo), BI (columna nueva en
  `puzzle_attempts`).
- **Impacto:** **medio** · **Esfuerzo:** M

---

### PED-19 | Métricas que son ruido y ocupan el lugar de las que importan

- **Evidencia:**
  - `capturas/reloj-390.png`: los tres `Stat` principales son "Jugadas bajo 3 segundos **47,7 %**
    de 289.727 jugadas con reloj", "Derrotas por tiempo **854**" y "Jugadas medidas **236.385**".
    Las 289.727 son de todas las clases (inventario §3.5), o sea mayoritariamente bala y blitz.
    Las 854 derrotas por tiempo están todas menos una en una fase mal clasificada (PED-02).
  - `capturas/partida-390.png`: "PEONES PERDIDOS **8,6**" en rojo, al lado de "PRECISIÓN 85,8 %"
    y "GRAVES 1". Inventario §6.2(h): es la suma de `cp_loss`, correctamente explicada en su
    tooltip, pero como titular se lee como contradicción.
  - `capturas/partida-390.png`: "GRAVES 1" en la tarjeta y "2 errores graves marcados" al pie del
    gráfico, a 300 px de distancia (inventario §6.2(g): `EvalChart` no filtra por `is_mine`).
- **Hecho:** cuatro números destacados en dos pantallas miden poblaciones distintas de las que su
  etiqueta sugiere, o se contradicen entre sí.
- **Opinión:** para un jugador de 1200-1500, "jugadas medidas: 236.385" y "peones perdidos 8,6"
  no son métricas, son telemetría. Nada de lo que haga en su próxima partida depende de ellas.
  El espacio que ocupan es el espacio donde deberían estar piezas colgadas por partida (PED-13) y
  conversión de ventaja (PED-14).
- **Problema:** la jerarquía de números premia lo que es fácil de contar sobre lo que es útil
  saber.
- **Impacto en el alumno:** ruido en las dos pantallas que más usa, y en un caso dos números
  distintos para la misma cosa, que es lo que más rápido destruye la confianza en una app de
  datos (la propia `CLAUDE.md` lo dice sobre otro tema).
- **Propuesta concreta:**
  1. `/reloj` restringe sus tres `Stat` a rápida, como `/errores`, y cambia "jugadas medidas" por
     algo accionable o lo quita.
  2. `/partida` reemplaza "peones perdidos" por el conteo que ya tiene sentido (graves + errores),
     o lo baja del nivel de titular.
  3. `EvalChart` cuenta solo los graves de Gabriel, o dice explícitamente que cuenta los dos
     bandos. Hoy no dice nada y no coincide con la tarjeta de arriba.
- **Otras visiones que toca:** UX (jerarquía de `Stat`), BI (filtros por clase en `/reloj`).
- **Impacto:** **medio** · **Esfuerzo:** S

---

### PED-20 | El formato base declarado (15+10) no es el que juega, y la app no lo distingue

- **Evidencia:** inventario §6.2(i): en todo el histórico hay **19** partidas con
  `time_control = '900+10'` contra **2.569** con `'600'`. Ninguna vista ni página distingue
  controles de tiempo dentro de `time_class = 'rapid'`; `games.base_seconds` e
  `increment_secs` existen (`0001_init.sql:56-57`) y no se usan para agrupar en ninguna parte.
- **Hecho:** su "rápida" es 10+0, no 15+10. La app las trata como lo mismo.
- **Opinión:** la diferencia entre 10+0 y 15+10 es pedagógicamente grande para un 1250: el
  incremento es lo que permite calcular en el final sin jugar a la bandera, y es probablemente
  parte de por qué tiene 854 derrotas por tiempo. Que el plan diga 15+10 y la práctica sea 10+0
  es exactamente el tipo de brecha que una app de seguimiento personal debería detectar.
- **Problema:** la app no puede notar una desviación del plan que sus propios datos contienen.
- **Impacto en el alumno:** menor de forma directa; relevante como caso del mismo patrón de
  PED-01: la app no compara lo declarado con lo hecho en ninguna dimensión.
- **Propuesta concreta:** mostrar el control de tiempo real en la portada junto al conteo de
  rápida ("15 partidas de rápida este mes, 15 de 10+0"). `formatTimeControl` ya existe y está
  testeado. Si se implementa la adherencia al plan de PED-01, esto es una línea más del mismo
  bloque, no una funcionalidad aparte.
- **Otras visiones que toca:** UX (una línea), BI (agrupar por `time_control`, no por
  `time_class`).
- **Impacto:** **bajo** · **Esfuerzo:** S

---

## C. Lo que descarté por el filtro de riesgo

Estas ideas son buenas en abstracto y las descarto **explícitamente** porque aumentan el tiempo
mirando la app sin aumentar partidas jugadas, derrotas revisadas ni errores corregidos:

- **Un motor de insights tipo Lichess** (métrica × dimensión × filtro). Un cubo OLAP para un solo
  usuario invita a explorar en vez de entrenar. La app debe responder cinco preguntas bien y
  decir la conclusión.
- **Radar de temas, estadísticas de puzzles, historial de precisión.** Todo eso es mirar el
  espejo. La única métrica de progreso que propongo son dos números (PED-05, PED-13).
- **Rachas, notificaciones, ligas, insignias.** Ya prohibidas por regla del proyecto desde la
  Fase 4, y la regla es correcta: premian abrir la app.
- **Prep de rivales.** Juega en línea contra desconocidos.
- **Un curso de finales o lecciones propias.** No hay que construir un curso; hay que ordenar la
  cola de ejercicios propios por el tema de la semana (PED-11).
- **Explorador de aperturas de Lichess como pantalla.** Como consulta puntual dentro del modo
  "Primero yo" ("te saliste de la teoría en la jugada 6, acá se juega X") sí pasa el filtro; como
  pantalla de exploración, no.

---

## D. Tesis

Chessito hoy es un excelente sistema de medición con un entrenador colgado al costado, y la
medición está apuntando al lugar equivocado: cuenta bala como si fuera entrenamiento, llama
"finales" al medio juego, diagnostica con 108 partidas mientras 1.406 están escondidas, y guarda
silencio justo cuando tiene la conclusión (los errores no vienen de jugar rápido; vienen de las
posiciones que él ya identificó como difíciles y no supo resolver).

Para que el alumno mejore de verdad, la app tiene que dejar de ser un panel y volverse un **lazo
cerrado y corto**: perdí una partida de rápida → la app me la pone adelante sin revisar → la
analizo **yo primero**, marco dónde creo que se perdió y por qué → recién ahí aparece el motor y
contrasta → los errores de esa partida se convierten en la sesión de 10 ejercicios de mañana →
y una vez al mes un solo número me dice si dejé de colgar piezas. Cuatro eslabones, tres de los
cuales ya están construidos y son buenos; falta el primero (la cola de derrotas sin revisar), el
ritual del cuarto (el autoanálisis sin motor, que es el corazón de su plan y hoy la app
directamente lo spoilea), y el último (la verificación de que el error dejó de repetirse, que
hoy no existe en ningún lado).

Y la portada tiene un solo trabajo: decirle si está jugando rápida. Hoy hace lo contrario.
Arreglar eso cuesta cambiar una columna —`n_games` por `n_rapid`— y es el cambio con mejor razón
impacto/esfuerzo de todo este informe.

---

## E. Revisión cruzada

Leídos `02-ux.md` (UX-01..UX-18) y `03-bi.md` (BI-01..BI-22, catálogo y North Star PVR).

### E.1 · Hallazgos ajenos que refuerzo

- **UX-01 + BI-10 ↔ PED-01 (la portada premia la bala).** Los tres llegamos al mismo hecho por
  caminos distintos: UX por la jerarquía visual, BI por `claseDominante` y `n_games`, yo por el
  plan declarado. **Lo que agrego:** el cruce longitudinal que ninguno hace explícito — su máximo
  de rápida (1464) es del mes de 408 partidas de rápida, y hoy está en 1268 tras siete meses de
  139 rápidas contra 2.111 de bala y blitz. BI lo tiene como candidato F3; para un profesor, ese
  gráfico **es** la conversación con el alumno, no un ítem de catálogo.
- **BI-04 ↔ PED-02 (la fase rota).** BI cuantifica el daño transversal mejor que yo (cuatro vistas
  contaminadas) y apoyo su propuesta dura: **mientras no se corrija, `/errores` no debe mostrar el
  corte por fase.** Una pregunta menos es mejor que una respuesta invertida. **Lo que agrego:** el
  costo no es analítico sino curricular — desvía dos de las ocho semanas de su ciclo y de paso le
  confirma que su medio juego está sano.
- **BI-01 + BI-02 + BI-09 ↔ PED-04 (la muestra amputada).** BI lo documenta mejor; nada que
  corregir. **Lo que agrego:** `n_diverged ≥ 10` en las cinco líneas de su repertorio (BI-13) es la
  meta de backfill correcta y es pedagógica, no técnica: 150-200 partidas bien elegidas responden
  "hasta dónde llega mi libro", que es la semana 7 del ciclo.
- **UX-07 + BI-08 ↔ PED-08 (la respuesta que no se dice).** Coincidimos en diagnóstico y cura.
  **Lo que agrego:** la lectura de entrenador. Que falle 5 veces más donde más piensa significa que
  **sí reconoce los momentos críticos y no los resuelve**. Eso descarta la semana de gestión de
  reloj y prioriza cálculo —candidatas, capturas y jaques, "¿qué amenaza su última jugada?"—, que
  son las semanas 1 y 3.
- **UX-04 + BI-21 ↔ PED-06/PED-07 (el ritual sin motor).** Los tres informes, por separado, lo
  marcamos como la carencia de contenido más grave. Firmo la propuesta de UX-04 (modo ciego, marcar
  el ply, comparar) y el esquema de BI-21 (`game_reviews`). **Lo que agrego:** el valor no está en
  registrar que revisó, está en el **contraste**; BI ya derivó de ahí la métrica correcta (S5),
  aunque la dejó en el puesto seis (ver E.2).
- **UX-02 + BI-15 ↔ PED-03 (los 397 vencidos).** Coincidencia total, incluida la conclusión de que
  es el mejor impacto/esfuerzo del proyecto.
- **BI-14 ↔ PED-15 (el panel en 0 %).** Aquí BI me corrige y lo digo: yo atribuí el 0 % a que el
  panel cruza dos poblaciones (ejercicios de todas las clases contra un diagnóstico de rápida). Eso
  es cierto y explica el `n=3`, pero **no** explica el 0 %. La causa real es estructural:
  `v_conceptos_fallados_rapida` calcula `aciertos` bajo `concepto is not null`, y `concepto` solo se
  escribe al fallar (`actions.ts:26-29`), así que el numerador **nunca puede valer otra cosa**. Mi
  PED-15(1) no arregla eso; la propuesta de BI-14 sí. Retiro la mía en favor de la suya.

### E.2 · Hallazgos que contradigo, y por qué

- **La North Star PVR (BI §5): buena métrica de analista, equivocada como el número del alumno.**
  No se la daría. Cuatro objeciones:
  1. **No es accionable.** "Regalaste 38 puntos de probabilidad de victoria" no dice qué hacer
     distinto mañana. Mezcla en un escalar colgar una dama en la jugada 12 con una deriva lenta de
     veinte jugadas mediocres: dos enfermedades con dos tratamientos.
  2. **Depende del largo de la partida.** `regalo(g)` es una **suma** sobre jugadas propias
     no-libro; una partida de 100 plies tiene el doble de oportunidades de sumar que una de 40. Sin
     normalizar por jugada, PVR premia perder rápido. La mediana sobre 20 amortigua el outlier, no
     el sesgo de longitud.
  3. **No se puede publicar en meses.** El propio BI lo dice: hay 108 partidas de rápida analizadas
     y la ventana de 20 estaría sesgada por BI-09 y amputada por BI-01.
  4. **No es la palanca de un 1250.** Entre 1250 y 1500 el rating lo mueve casi enteramente dejar
     de regalar material en una jugada; lo demás es ruido a esa escala.
  **Contrapropuesta:** la North Star es **S1, material colgado por partida de rápida** —que BI ya
  definió bien con su corte de `cp_loss ≥ 250`— expresada en la unidad que él entiende: *"piezas
  colgadas por partida"*. Es su debilidad declarada nº 1, se lee sin explicación, baja con el
  entrenamiento y tolera menos cobertura que PVR porque cuenta eventos con nombre. PVR queda como
  métrica de apoyo, normalizada por jugada, para cuando la cobertura exista. Y **S5 (acierto del
  autodiagnóstico) debería subir al segundo lugar**: es la única de las nueve que mide si está
  aprendiendo a *ver*, que es lo que el ritual sin motor entrena.
- **La portada de 3 tareas de UX: de acuerdo con la estructura, no con el número "2 partidas".**
  El orden (jugar → revisar → entrenar) y el contador diario son correctos. Pero "2 partidas de
  rápida" es una constante inventada que además no cierra con la meta mensual: 2 al día por 30 días
  son 60, y la meta es 30. La tarea del día tiene que **derivarse** de lo que falta y los días que
  quedan (hoy: 15 en 14 días → 1 por día), o el alumno aprende a ignorarla. Reserva menor: el botón
  de UX-09 lo deja en chess.com, donde la bala está a un tap; no es razón para no ponerlo, sí para
  que apunte al emparejamiento del formato declarado y no al lobby.
- **Reducir `/ritmo` a una frase: de acuerdo, pero voy más lejos que UX-05 y BI-06.** Los dos
  conservan la página con la hora del día como titular. Yo eliminaría la pantalla y dejaría la hora
  como una línea dentro de otra. Razones de entrenador: (a) "no juegues a las 13 h" no es una
  habilidad, es logística, y compite por atención con cosas que sí se entrenan; (b) el corte horario
  está confundido con el contexto —a las 13 h probablemente juega en un rato corto de almuerzo, así
  que mide el tipo de sesión, no el reloj biológico— y darle el titular de una sección le concede un
  peso causal que no tiene; (c) una sección menos en la barra lateral vale más que un gráfico bien
  encuadrado. El espacio liberado es para derrotas sin revisar (PED-07) o conversión (PED-14).
- **UX-12(1): esconder la tasa por `n` insuficiente.** No alcanza, por BI-14: con el bug
  estructural la tasa es 0 % aunque hubiera 500 ejercicios. Primero BI-14, después el umbral.
- **BI-04, el umbral concreto del final (≤3 piezas por bando).** Reserva menor: es tardío —torre y
  una menor por bando todavía sería "medio juego"— y volvería a distorsionar en el otro sentido.
  Prefiero damas fuera, o material no-peón por bando bajo un umbral (≈13 puntos con D=9, T=5,
  A/C=3), que es lo que usa cualquier manual.
- **BI-19 (`rated`): lo bajaría de prioridad.** Juega la escalera pública; la fracción de amistosas
  es probablemente marginal y el propio informe no la pudo medir. Cuesta una reingesta completa por
  un beneficio no demostrado. Antes van BI-01, BI-04 y BI-09.

### E.3 · Conexiones que los otros no vieron

- **BI-09 → PED-12: el orden de la cola de motor explica por qué los ejercicios son imposibles.**
  Como el motor gastó su presupuesto en blitz y bala, **384 de los 400 ejercicios salen de partidas
  de 2+1 y 3+0**. Un blunder de bala rara vez es un problema de cálculo: es un problema de reloj, y
  **no tiene solución encontrable sin reloj**. Servido como ejercicio sin límite de tiempo es
  injusto casi por definición, y eso es una explicación estructural del 2,3 % de acierto que ni BI
  (que ve el sesgo) ni UX (que ve el 0 %) conectan con la calidad del ejercicio. Cadena completa:
  BI-09 → composición del set → PED-12 (dificultad) → BI-14/UX-12 (el panel) → PED-03 (la deuda
  que nunca baja).
- **BI-04 + BI-07 + PED-08 son un solo diagnóstico partido en tres pantallas.** Si se arregla la
  fase, las jugadas de `>30 s` con 18,4 % de error caen casi con certeza en el medio juego real, y
  las tres piezas se funden en una frase: *"tus errores están en el medio juego, en las posiciones
  que ya identificaste como críticas"*. Es exactamente su debilidad declarada nº 2, confirmada por
  datos, y hoy no la dice nadie porque está repartida entre una columna rota (`phase`), una vista
  sin dimensión (`/reloj`) y un panel sin conclusión (`/errores`).
- **BI-17 `cola_de_repaso_desbordada` no se puede cumplir nunca sin tocar SM-2.** El chequeo se
  pondría rojo hoy y seguiría rojo para siempre, porque la causa no es de datos: al fallar,
  `nextReview` devuelve `dueAt = now` (`sm2.ts:33-38`), o sea el programador **fabrica** la
  condición que el chequeo vigila. Un invariante de calidad no arregla un bug de política: va junto
  con PED-03(4), no solo.
- **UX-09 + BI-20/PED-20: el botón a 15+10 no solo empuja, también mide.** Si la portada manda al
  formato declarado, la brecha entre 19 partidas en `900+10` y 2.569 en `600` deja de ser una
  curiosidad del inventario y se vuelve una señal de adherencia con causa conocida. El botón crea
  el instrumento; nadie lo notó.
- **La disciplina del `n` tiene un agujero que solo se ve enseñando.** BI §4 lo formula bien ("el
  `n` que se muestra tiene que ser el de la unidad independiente"). El caso pedagógico que le agrega
  fuerza: 170 intentos sobre 3 ejercicios son 3 observaciones, y decirle a un alumno "te equivocas
  170 veces en esto" cuando son 3 posiciones repetidas es el hallazgo falso más caro posible,
  porque **nombra una debilidad de carácter** sobre una muestra de tres.

### E.4 · Propuestas que deberían fusionarse

| Nombre propuesto | IDs que son la misma cosa | Nota |
|---|---|---|
| **Rápida por defecto en toda la app** | PED-01, PED-09 · UX-01, UX-05, UX-06 · BI-06, BI-07, BI-10, BI-12 | Nueve hallazgos, una sola decisión: la clase de tiempo se fija por intención (el plan), no por volumen. Se implementa una vez y arregla portada, ritmo, aperturas y reloj. **Debería ser el ítem 1.** |
| **Backfill de rápida con meta acotada** | PED-04 · BI-01, BI-02, BI-03, BI-09, BI-13 · chequeos de BI-17 | Desbloquear las 1.406 `skipped`, invertir el orden de la cola, arreglar la cobertura declarada. Meta explícita y terminable: `n_diverged ≥ 10` en las 5 líneas del repertorio. Sin esto quedan bloqueados PED-05, PED-13, PED-14, BI-22 y cualquier North Star. |
| **Redefinir y re-derivar la fase** | PED-02 · BI-04 (y sus dependientes C1, B3) | Un umbral y un backfill de `moves.phase`. Mientras tanto, ocultar el corte por fase en `/errores` y `/reloj`. |
| **Modo ciego y la cola de derrotas sin revisar** | PED-06, PED-07 · UX-04 · BI-21 (S4, S5) | Una sola funcionalidad de punta a punta: la portada ofrece la derrota, `/partida` abre sin motor, el alumno marca ply y motivo, la app contrasta, y con eso queda registrada como revisada. Partirlo en tres lo mata. |
| **Sesión de 10, elegida por prioridad** | PED-03, PED-10 · UX-02 · BI-15, BI-16 (`dueByTheme`) | Acotar el tamaño, cambiar el criterio de selección (derrotas recientes → tema de la semana → repaso) y quitar el `dueAt = now` de SM-2. Las tres partes son la misma decisión de producto. |
| **Cada panel cierra con su conclusión** | PED-08, PED-17 · UX-05, UX-07 · BI-05, BI-08 | Regla transversal, no seis ediciones de copy: todo panel titulado con una pregunta escribe su respuesta, con `n` y con la advertencia de causalidad cuando corresponda. Es texto, y cambia el plan de estudio. |
| **Arreglar la tasa de acierto por concepto** | PED-15 · UX-12 · BI-14 | El orden importa: primero el bug estructural (BI-14), después el umbral de muestra (UX-12), después el residuo `empeora_la_posicion` (PED-15(3)). |
| **Las dos debilidades, medidas** | PED-13, PED-14 · BI-22 (S1, S2) | Piezas colgadas por partida y conversión de ventaja son las dos mitades del diagnóstico que él mismo declaró, y ninguna existe. Van juntas porque juntas reemplazan a PVR como el par de números de la portada. |
