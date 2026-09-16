# Plan de revisión integral de Chessito

**Commit revisado:** `1855bd7cea65c91b362b99576e6cc0b52ab01e7d` (2026-09-15 21:00 -03)
**Fecha:** 2026-09-16 · **Rama:** `review/plan-integral`
**Base consultada:** Supabase `chessito-prod` (`tnyphngqoajoqeeqvkkq`), solo SELECT

**Insumos:** `00-inventario.md` (datos y recorrido), `00-benchmark.md` (referentes),
`01-pedagogia.md` (PED-01..20), `02-ux.md` (UX-01..18), `03-bi.md` (BI-01..22), y la revisión
cruzada de los tres. 58 hallazgos con evidencia, fusionados acá en **19 propuestas** repartidas
en cuatro fases.

## Limitaciones: qué no se pudo verificar

1. **No hay acceso a la service role key ni al deploy.** Las capturas salen de `next dev` contra
   un arnés que sirve las filas reales extraídas por SELECT (§6 del inventario). No se ejercitó
   PostgREST, ni el middleware de sesión, ni el motor WASM en el navegador.
2. **La causa de las 4.777 partidas marcadas `skipped` no se pudo determinar.** El estado es un
   hecho verificado; ningún camino del código actual lo explica. La hipótesis (una corrida manual
   de SQL) no es verificable desde acá.
3. **El criterio de aceptación de la Fase 4 de `PLAN.md`** ("resolver 10 ejercicios seguidos sin
   que ninguno sea injusto") sigue sin verificar: exige jugarlos a mano.
4. **La correlación ACPL ↔ precisión de chess.com** (capa 2 de `docs/CONFIANZA.md`) no se calculó.
5. **Todo lo etiquetado como opinión en los tres informes** es juicio profesional, no medición.

---

## 1. Resumen ejecutivo

### Los cinco hallazgos más importantes

**1. La app mide volumen y el alumno necesita que mida rápida.** En 90 días jugó 1.600 de bala,
752 de blitz y 48 de rápida, contra un plan que dice cero bala hasta 1500. Su máximo de rápida
(1464) es de febrero de 2026, el mes en que jugó 408 partidas de rápida; hoy está en 1268. La
portada le devuelve un calendario verde los 15 días (cuenta bala), el rating **de blitz** como
número grande, y "455 partidas en total este mes" en gris, donde 436 son de bala.
Nueve hallazgos de las tres visiones son la misma decisión: **la clase de tiempo se elige por
volumen y debe elegirse por intención**. `[PED-01, PED-09 · UX-01, UX-05, UX-06 · BI-06, BI-07,
BI-10, BI-12]`

**2. 4.777 partidas jugables están excluidas del motor para siempre, y los diez chequeos de
calidad están en verde.** 1.406 de ellas son de rápida —el 54 % de la clase que importa— con
todas sus jugadas y todos sus relojes extraídos. `v_analysis_coverage` no las cuenta en ninguna
columna: `108 + 1.074 + 0 ≠ 2.588`. Encima, la cola del motor ordena rápida y blitz empatadas, y
como el histórico reciente es blitz, se analizaron 1.674 de blitz contra **108** de rápida.
`[PED-04 · BI-01, BI-02, BI-09]`

**3. Lo que la app llama "final" es el medio juego.** `ENDGAME_MAX_PIECES = 6` cuenta piezas sin
peones ni reyes, y al inicio cada bando tiene 7: basta un cambio por bando para declarar "final".
En rápida: 876 jugadas de apertura, **112** de medio juego, **2.041** de final, y 102 de 130
errores graves en "final". La debilidad declarada del alumno es "no sé qué hacer en el medio
juego", y la app le está mostrando esa evidencia con la etiqueta equivocada, dirigiendo mal dos
de las ocho semanas de su ciclo. `[PED-02 · BI-04]`

**4. La app tiene dos respuestas medidas y no dice ninguna.** *"¿Los errores se concentran en las
jugadas rápidas?"* → **no**: 3,4 % de error bajo 3 s contra 18,4 % sobre 30 s, monótono y
replicado en blitz. *"¿Hay tilt y fatiga?"* → **no hay efecto**: los intervalos de Wilson se
solapan por completo, y con n≈980 por brazo haría falta un orden de magnitud más para resolver la
diferencia observada. Las dos pantallas dibujan el dato y callan la conclusión.
`[PED-08, PED-17 · UX-05, UX-07 · BI-05, BI-08]`

**5. El ciclo de aprendizaje está cortado en los dos extremos.** No hay entrada —ninguna cola de
derrotas de rápida sin revisar; llegar a la última derrota cuesta 5 taps y un scroll horizontal
que la interfaz no señaliza— y no hay salida: nada responde "¿dejé de colgar piezas?". En el
medio, el ritual central del plan (*toda derrota se analiza primero sin motor*) no solo no está
soportado: `/partida/[id]` lo quema al abrir, mostrando precisión, glifos `??`, evaluación por
jugada y "Tu peor jugada fue Nxf7" antes de que el alumno mire.
`[PED-05, PED-06, PED-07 · UX-04 · BI-21]`

### La tesis

Chessito es un buen sistema de medición apuntado al lugar equivocado. No necesita más pantallas:
necesita **medir rápida**, **decir lo que ya sabe**, y **cerrar el lazo**.

> Perdí una partida de rápida → la app me la pone adelante sin revisar → la analizo **yo primero**,
> marco dónde creo que se perdió → recién ahí aparece el motor y **contrasta** → los errores de esa
> partida son mi sesión de 10 ejercicios de mañana → y una vez al mes un número me dice si dejé de
> colgar piezas.

Cuatro eslabones. Dos ya están construidos y son buenos (`/partida/[id]` y `/entrenador`). Falta
el primero (la cola de derrotas), el ritual del tercero (el modo ciego), y el último (la
verificación). Y la portada tiene un solo trabajo: decirle si está jugando rápida. Hoy hace lo
contrario.

---

## 2. Qué funciona bien y hay que proteger

Esto no se toca, y cada fase verifica que sigue funcionando:

1. **La ingesta y su reconciliación UUID a UUID.** 10.106 partidas, idempotente, al día.
2. **El pipeline de dos transportes** (`IngestStore` con `supabase-store` y `pg-store`), y la
   regla de una lógica con dos implementaciones.
3. **La extracción de relojes.** 0 % de nulos en `clock_ms` y `move_time_ms` sobre 579.194 filas,
   cero tiempos negativos. La trampa 1 de `CLAUDE.md` está resuelta de verdad.
4. **Los dos pasos de signo** y su test con motor falso (`tests/analyze.integration.test.ts`).
5. **`/partida/[id]`**: tablero de análisis con variaciones, motor en el navegador, barra de
   ventaja, momentos clave. La mejor pantalla de la app.
6. **La explicación determinista del error** (`lib/puzzles/explain.ts`, `diagnostico.ts`). Es una
   ventaja real sobre los referentes, no una brecha.
7. **SM-2 calificando por acierto al primer intento sin pista**, y los reintentos sin límite.
8. **La disciplina de `n`, Wilson y el umbral de 20**, con filas atenuadas.
9. **`Clasificacion` siempre con glifo y texto**; el color es refuerzo.
10. **Los bloques vacíos que dicen qué falta** en vez de inventar números.
11. **`/salud`** como pantalla de confianza, con el botón que dispara el workflow.
12. **`min-w-0` en `Panel`**: ninguna de las nueve pantallas desborda a lo ancho, ni a 390 px ni
    a 1280 px (medido, §6.1 del inventario).

---

## 3. Diagnóstico integrado, por pantalla

La prueba aplicada: **después de verla, ¿qué hace distinto el alumno en su próxima partida?**

| Pantalla | Veredicto | Qué falla | Propuestas |
|---|---|---|---|
| `/` | **Contraproducente** | Calendario y rating cuentan bala; el contador solo puede valer 0 o 2 (`app/page.tsx:176`); dos bloques vacíos; la única tarea accionable no tiene botón | R1, R2, R6, R7 |
| `/errores` | **Informa mal** | Declara 1.782 de 10.106 cuando son 108 de 2.588; la fase está invertida; el panel pregunta y no responde | R3, R4, R5 |
| `/ritmo` | **Nada** | Dos de sus tres gráficos miden un efecto nulo; el tercero grafica blitz; eje 0-100 % para datos entre 40 % y 62 % | R4, R1 |
| `/reloj` | **Informa mal** | Las cuatro vistas de `0006` no separan clase de tiempo: describe la bala. La fase rota contamina timeouts y distribución | R5, F2-04 |
| `/aperturas` | **Informa mal** | Mezcla las tres clases en el mismo gráfico; nombres truncados a 390 px; no existe el repertorio | R1, F4-01 |
| `/registro` | **Índice** | Resultado y "Analizar" fuera de pantalla en celular; no marca qué derrotas ya revisó | R10, F2-01 |
| `/entrenador` | **Enseña, mal dirigido** | 397 vencidos como deuda; sirve el más viejo de la cola; el panel dice 0 % en todo, por un bug estructural | R6, R8, F2-03 |
| `/partida/[id]` | **Enseña, rompe el ritual** | Entrega el veredicto del motor antes de que el alumno mire; dos números se contradicen; error de hidratación | R9, F2-02 |
| `/salud` | **Correcta, ciega** | 10/10 en verde con 4.777 partidas mal marcadas; 4.004 px de alto en celular | R3, R10 |

### Diagnóstico por flujo (taps contados desde abrir la app, a 390 px)

| Flujo | Hoy | Debería ser | Propuesta |
|---|---|---|---|
| Revisar mi última derrota | **5 taps** + scroll horizontal sin señalizar | 1 tap | R7 |
| Autoanálisis sin motor, y después con motor | **IMPOSIBLE** (abrir la partida lo quema) | 2 taps y una decisión | F2-02 |
| Ver mi progreso del mes | 0 taps, **y la respuesta es de otro juego** | 0 taps, con el rating de rápida | R1 |
| Entrenar mis errores | 1 tap (correcto), mal dirigido | 1 tap, dirigido | R6, F2-03 |
| Registrar una sesión | **IMPOSIBLE** | 2 taps | F2-01 |

---

## 4. Arquitectura de información propuesta

Celular primero. El criterio de orden es uno: *¿esto hace más probable que juegue, que revise una
derrota o que entrene?* Si solo informa, va más abajo.

### Portada (`/`)

| # | Bloque | Contenido | Fase |
|---|---|---|---|
| 1 | Saludo y estado de la ingesta | Sin cambios | — |
| 2 | **Tu plan de hoy — tres tareas de HOY** | ☐ Jugar N de rápida (N derivado de lo que falta ÷ días que quedan) · ☐ Revisar tu derrota sin revisar · ☐ 10 ejercicios. Contador diario 0/3, no mensual | R6, R7 |
| 3 | **Rápida este mes** | El número principal, calendario pintado con `n_rapid`, tercer tono para días con otra clase, y la frase con nombre: "436 de bala este mes. Tu plan dice cero hasta 1500" | R1 |
| 4 | **Rating de rápida** | Rating de rápida fijo, delta contra el mes anterior, máximo histórico (1464, feb-2026) y sparkline. Llena el bloque "Estás mejorando" | R1 |
| 5 | **Esto no mejora** | Una sola fila: la peor apertura **de rápida** con n≥20, con enlace a sus partidas | R1 |
| 6 | Salud del sistema | Sin cambios, al final | — |

**Sale de la portada:** "No lo olvides jugando" (bloque vacío) y "Lo próximo que vence" con su
segundo botón (la deuda de repetición espaciada, hoy duplicada). Su lugar es `/entrenador`.
**No lleva:** racha, puntos, ligas ni notificaciones. El contador "0/3 de hoy" no acumula, no se
pierde y se reinicia cada día.

### Navegación

- **Analizar:** `/aperturas`, `/errores`, `/reloj`, `/registro`
- **Entrenar:** `/entrenador`
- **Partida:** `/partida/[id]` (con modo ciego desde la Fase 2)
- **Sistema:** `/salud`
- **`/ritmo` deja de ser una sección de análisis** y pasa a ser una página de conclusiones: dos
  frases con su `n` y su intervalo (tilt y fatiga: no hay efecto) más el corte horario con su
  advertencia de comparación múltiple. Se mantiene la ruta; se saca del grupo "Analizar" cuando
  la Fase 2 tenga con qué llenar ese lugar.

---

## 5. Catálogo de análisis y gráficos

`n actual` sale del inventario. Estado: **HOY** (los datos existen y bastan), **COBERTURA**
(bloqueado por R3), **DATOS** (requiere captura nueva).

| # | Pregunta | Origen | Visualización | n actual | n requerido | Estado |
|---|---|---|---|---|---|---|
| 1 | ¿Estoy jugando lo que dice mi plan? | `v_games_by_day.n_rapid`, `v_monthly_summary` | Calendario por `n_rapid` + frase con el conteo de bala | 15 rápida / 436 bala en sept | 1 día | **HOY** |
| 2 | ¿Estoy mejorando mes a mes? | `v_monthly_activity_wilson` filtrada a rápida | Sparkline de rating + Wilson mensual | 23 meses, 6 con n≥20 | 20/mes | **HOY** |
| 3 | Bala vs rápida, ¿me cuesta el rating? | `v_monthly_activity_wilson` | Dos series en el mismo eje temporal | 23 meses | 6 meses | **HOY** |
| 4 | ¿Contra qué línea pierdo, en rápida? | `v_opening_performance` filtrada a `rapid` | `BarrasH` Wilson, nombres completos | 15 aperturas con n≥20 | 20 | **HOY** |
| 5 | ¿Mis errores vienen de jugar rápido? | `v_errors_by_move_time` | `BarrasV`, **con el título = la respuesta** | 3.029 jugadas de rápida | 20/bucket ✓ | **HOY** |
| 6 | ¿Hay tilt o fatiga? | `v_after_result`, `v_by_session_index` | **Ninguna.** Una frase con el intervalo | 959/987 y 199-690 | ~6.800/brazo (inalcanzable) | **HOY** (decir el nulo) |
| 7 | ¿A qué hora juego peor? | `v_by_hour` filtrada a `rapid` | `BarrasV` 24 columnas, eje acotado, Wilson | 113-246 por hora | 20 ✓ | **HOY** (con advertencia de comparación múltiple) |
| 8 | ¿El formato que juego es el declarado? | `base_seconds`, `increment_secs` | Dos números | 19 en 900+10 vs 2.569 en 600 | 1 | **HOY** |
| 9 | ¿En qué fase cuelgo piezas? | `v_errors_by_phase` con `phase` corregida | `BarrasH` de tasa por fase | 3.029 jugadas de rápida | 20/fase | **HOY tras R5** |
| 10 | ¿Dónde pienso, en rápida? | Vistas de `0006` + `time_class` | Línea de mediana por ply | 289.727 jugadas, sin separar | 20 partidas/clase | **HOY tras F2-04** |
| 11 | ¿Cuánto me sobra del reloj al terminar? | `moves.clock_ms` del último ply propio | Histograma | 579.194 filas, 0 % nulo | 20/clase | **HOY** (vista nueva) |
| 12 | ¿Cuántos graves por partida, y baja? | `games.blunders` por mes, rápida | Sparkline con banda | 108 analizadas de rápida | 20/mes → ~240/año | **COBERTURA** |
| 13 | ¿Cuántas piezas colgué por partida? | `moves` con `classification=3 and cp_loss≥250` | Un número + serie | 108 analizadas | ~470 para detectar 0,7→0,5 | **COBERTURA** |
| 14 | ¿Convierto las ventajas? | `moves.eval_cp` girado × `games.result` | Tasa + lista enlazada | 108 analizadas | 30 con ventaja | **COBERTURA** |
| 15 | ¿Qué blunders del rival no castigué? | `moves` con `is_mine = false` | Conteo mensual + enlace | 83,2 % sin `eval_cp` | 20 partidas | **COBERTURA** |
| 16 | ¿En qué ply se tuerce cada apertura? | `median_divergence_ply`, `n_diverged` | Puntos sobre eje de ply | `n_analyzed` 0-13 | **`n_diverged ≥ 10`** | **COBERTURA** |
| 17 | ¿Llegué a mi repertorio, y si no, qué me jugaron? | `repertoire` (nueva) × `v_opening_performance` | Una barra por entrada + tabla de respuestas | Ponziani 165+131; respuestas 72/41/40/23/22 | 20/entrada ✓ | **DATOS** (la mitad del rendimiento es HOY) |
| 18 | ¿Coincide lo que yo creo con lo que dice el motor? | `game_reviews` (nueva) | Tasa de coincidencia de ply | 0 | 20 revisiones | **DATOS** |
| 19 | ¿Reconozco el error que cometo? | `puzzle_attempts` + concepto elegido | Dos series | 0 | 20 fallos | **DATOS** |
| 20 | ¿El entrenamiento transfiere a la partida? | Concepto entrenado × mismo error después | Dos series en el tiempo | 0 | 20 partidas posteriores | **DATOS + COBERTURA** |

### North Star y métricas de apoyo

La contradicción entre los informes se resuelve así, con el criterio de desempate del proyecto
(impacto en que juegue, analice y deje de repetir errores):

> ## North Star · **Piezas colgadas por partida de rápida**
> `count(moves) filter (is_mine and not is_book and not is_decided and classification = 3 and cp_loss ≥ 250)`
> `÷ count(partidas)`, sobre las **últimas 20 partidas de rápida analizadas**. Menor es mejor.

**Por qué esta y no PVR.** BI propuso PVR (mediana de `win_pct_loss` regalado por partida) y tiene
razón en que se mueve más rápido: detectar una caída de 0,7 a 0,5 piezas colgadas por partida
necesita del orden de 470 partidas analizadas y hoy hay 108. Pero PED opuso dos objeciones que BI
no rebatió y que son decisivas: **PVR es una suma sobre jugadas propias, así que premia perder
rápido** (una partida de 100 plies tiene el doble de oportunidades de sumar que una de 40), y
**no es accionable**: mezcla en un escalar colgar una dama en la jugada 12 con veinte jugadas
mediocres. La North Star la lee el alumno, no un analista, y la suya es la única que se lee sin
explicación y nombra su debilidad declarada.

**PVR queda como métrica de apoyo, normalizada por jugada** (`Σ win_pct_loss ÷ jugadas propias
no-libro no-decididas`), porque el argumento de potencia estadística de BI es correcto: sirve para
detectar el cambio antes de que la North Star se mueva. Se reporta **al lado** de la North Star,
nunca en su lugar.

| # | Métrica de apoyo | Definición | Para qué |
|---|---|---|---|
| S1 | **PVR por jugada** | `Σ win_pct_loss ÷ jugadas propias no-libro no-decididas`, mediana de 20 partidas de rápida | Detecta el cambio antes que la North Star |
| S2 | **Conversión de ventaja** | De las partidas de rápida analizadas donde su evaluación girada superó +200 cp fuera del libro, la proporción que ganó. Ventana: últimas 30 con ventaja | La debilidad declarada nº 2, hoy sin medición |
| S3 | **Cobertura de análisis de rápida** | `rapid done ÷ rapid analizables`. **Hoy 108 ÷ 2.588 = 4,2 %** | Dice si se le puede creer a la North Star. Va siempre al lado |
| S4 | **Derrotas de rápida revisadas en 48 h** | `game_reviews ÷ derrotas de rápida` de los últimos 30 días | El ritual central del plan, medido por producto y no por minutos |
| S5 | **Acierto del autodiagnóstico** | De las derrotas revisadas, proporción en que el ply marcado coincide con el del motor (±2) | Mide si está aprendiendo a **ver**. Ningún referente la tiene |
| S6 | **Partidas de rápida en el mes** (guardarraíl) | `v_monthly_summary.n_rapid`. Meta 30 | Protege contra el riesgo principal |
| S7 | **Partidas de bala en el mes** (guardarraíl invertido) | `v_monthly_summary.n_bullet`. Meta del plan: **0**. Hoy: 436 | El incumplimiento más grande y más invisible |

**Descartadas y por qué:** *rating* (es el objetivo, se mueve por volumen y es incalculable en los
meses vacíos: en abril jugó 1 partida de rápida y el score del mes fue 1,000); *partidas jugadas*
(mide actividad y se optimiza jugando bala); *ejercicios resueltos* (mide uso de la app, que es
exactamente el riesgo principal, y hoy sería un castigo: 265 intentos con 6 aciertos).

---

## 6. Datos nuevos a capturar

| Dato | Esquema, a alto nivel | Por qué | Fase |
|---|---|---|---|
| **Motivo de exclusión** | `games.skip_reason text null` | Hoy `skipped` es terminal y sin explicación: por eso 4.777 filas mal marcadas fueron invisibles | R3 |
| **Cobertura completa** | `v_analysis_coverage2` con `n_skipped` | Para que las columnas sumen su propio `n_games` | R2 |
| **Reloj por clase** | Cuatro vistas nuevas con `time_class` en el `group by` | `/reloj` describe la bala | F2-04 |
| **Revisión de la partida** | `game_reviews`: `game_id`, `ply_marcado`, `motivo` (lista cerrada tocable), `creado_en`, `ply_del_motor` | El ritual central del plan. **Opciones tocables, no texto libre**: en celular es más barato y habilita S5, que el texto libre no | F2-01 |
| **Concepto reconocido** | `puzzle_attempts.concepto_elegido text null` | "Qué errores comete" vs "cuáles reconoce". Un tap, y es la sonda barata antes de construir el modo ciego | F2-03 |
| **Repertorio declarado** | `repertoire`: entrada, color, rol (`mío` / `respuesta del rival`), conjunto de `openings.id` o prefijo de EPD | El Ponziani aparece partido en dos filas; la semana 7 del ciclo no tiene soporte | F4-01 |
| **Ciclo de 8 semanas** | **Sin tabla**: una fecha de inicio en configuración y la lista de 8 temas en código | UX mostró que la app no tiene pantalla de ajustes; derivarlo de una fecha cuesta cero interfaz | F4-02 |
| **`rated`** | `games.rated boolean` + reingesta | Las amistosas contaminan todos los cortes. **Bajada de prioridad**: la fracción no se pudo medir y cuesta una reingesta completa | F4-03 |

---

## 7. Plan por fases

### Fase 1 · Que la app hable de rápida y diga lo que ya sabe

**Objetivo:** que cada número de la app se calcule sobre la población que dice, y que cada panel
que hace una pregunta escriba su respuesta. Cero pantallas nuevas, cero esquema nuevo salvo una
migración de vistas y de reparación.

**Resultado visible para el alumno:** abre la app y ve el rating de rápida, un calendario que se
enciende solo cuando jugó rápida, "436 de bala este mes, tu plan dice cero", tres tareas que puede
terminar hoy, su última derrota a un tap, y en `/errores` la frase *"no: fallas 5 veces más donde
más piensas"*.

**Riesgos:** (a) R5 re-deriva 579.194 filas — si el criterio de fase queda mal, el daño es mayor
que el actual, por eso lleva su tabla de medición y su chequeo; (b) R3 cambia `analysis_state` de
4.777 filas: la migración tiene que ser reversible y no borrar nada; (c) tocar la portada arriesga
lo que hoy funciona bien, por eso cada ítem verifica la lista de la sección 2.

**Cómo se valida:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde; capturas a
390 px antes y después de cada pantalla tocada; los diez chequeos de `v_data_quality` existentes
siguen en verde y los nuevos se ponen rojos donde deben.

| ID | Descripción | Justificación | Visiones | IDs de origen | PLAN.md | Imp. | Esf. | Dep. | Archivos | Criterio de aceptación |
|---|---|---|---|---|---|---|---|---|---|---|
| **R1** | **Rápida por defecto en toda la app.** Calendario con `n_rapid` y tercer tono para días de otra clase; rating de rápida fijo (no `claseDominante`); frase con el conteo de bala y la meta del plan; `/aperturas` y `/ritmo` filtran `rapid`; "Esto no mejora" usa solo rápida | La clase se elige por volumen y debe elegirse por intención. Es la decisión única detrás de nueve hallazgos | 3 | PED-01, PED-09 · UX-01, UX-05, UX-06 · BI-06, BI-10, BI-12 | Nueva | Alto | S | — | `app/page.tsx`, `app/aperturas/page.tsx`, `app/ritmo/page.tsx`, `lib/data.ts` | En la captura de la portada a 390 px el rating dice "rápida"; el calendario tiene ≤5 días encendidos en septiembre (hay 15 con partidas, 5 con rápida); aparece la palabra "bala" con su número; `/aperturas` y `/ritmo` no muestran ninguna fila de otra clase sin etiquetarla |
| **R2** | **Cobertura honesta.** La línea de cobertura se deriva del mismo corte que alimenta el gráfico. Vista nueva con `n_skipped` | `/errores` declara 1.782 de 10.106 cuando son 108 de 2.588: sobredeclara 16× | 3 | PED-04 · UX-07 · BI-02, BI-03 | Nueva | Alto | S | — | `supabase/migrations/0011_*.sql`, `lib/data.ts`, `app/errores/page.tsx`, `app/aperturas/page.tsx` | `/errores` dice "108 de 2.588 de rápida"; la vista nueva cumple `done + pending + failed + skipped = n_games` por clase |
| **R3** | **Reparar el universo de análisis.** Migración reversible que devuelve a `pending` las `skipped` sin motivo; columna `skip_reason`; la cola del motor pone rápida **antes** que blitz; tres chequeos nuevos | 1.406 partidas de rápida excluidas del motor para siempre, con los diez chequeos en verde. Sin esto quedan bloqueadas la North Star, S1, S2 y `divergence_ply` | 3 | PED-04 · BI-01, BI-09, BI-17 | Nueva | Alto | M | — | `supabase/migrations/0011_*.sql`, `lib/analysis/store.ts`, `lib/chess/game.ts` | Tras aplicar la migración en dev, `select count(*) from games where analysis_state='skipped' and skip_reason is null` da 0; `claimBatch` devuelve rápida antes que blitz (test); `skipped_sin_motivo` existe en `v_data_quality` |
| **R4** | **Todo panel que pregunta, responde.** Regla transversal: el título del panel es la conclusión, derivada del dato con su `n`, y la pregunta pasa al subtítulo. Se aplica a `/errores` (tiempo de jugada) y a `/ritmo` (tilt, fatiga, hora) | Dos de las cuatro preguntas del proyecto están respondidas y la app calla. Es texto, y cambia el plan de estudio | 3 | PED-08, PED-17 · UX-05, UX-07 · BI-05, BI-08 | Nueva | Alto | S | R1 | `app/errores/page.tsx`, `app/ritmo/page.tsx` | `/errores` contiene la frase con los dos números (3,4 % y 18,4 %) y la advertencia de causalidad; `/ritmo` dice "no hay efecto" con el `n` y el intervalo, y el corte horario lleva su advertencia de comparación múltiple |
| **R5** | **La fase, corregida y re-derivada.** Nuevo criterio de final (material no-peón total ≤ 13, con D=9 T=5 A/C=3), tests, script `moves:rephase`, y el chequeo `fase_final_implausible` | Lo que la app llama "final" es el medio juego, y eso desvía dos de las ocho semanas del ciclo del alumno | 2 | PED-02 · BI-04 | Nueva | Alto | M | — | `lib/chess/phase.ts`, `scripts/rephase-moves.ts`, `lib/ingest/*`, `supabase/migrations/0011_*.sql`, `tests/` | Sobre la muestra de 60 partidas de rápida, el "final" cae de 66,5 % a ≈17 % de los plies y el medio juego sube sobre 50 %; tests de `classifyPhase` en verde; `pnpm moves:rephase` es idempotente |
| **R6** | **El plan de hoy se puede completar.** Tres tareas de hoy con contador diario honesto; la meta diaria de rápida se **deriva** de lo que falta ÷ días que quedan; sesión acotada de 10 ejercicios; botón para ir a jugar; SM-2 deja de reprogramar para hoy al fallar | "Tu plan de hoy: 397 ejercicios, ~397 min" es una razón para cerrar la app, y el contador solo puede valer 0 o 2 | 3 | PED-03, PED-10 · UX-02, UX-09 · BI-15, BI-16 | Nueva | Alto | M | — | `app/page.tsx`, `app/entrenador/page.tsx`, `lib/spaced-repetition/sm2.ts`, `lib/data.ts` | La portada nunca muestra un número mayor que 10 como tarea; el contador refleja lo hecho **hoy** y puede valer 1/3 y 2/3; hay un enlace a jugar; `nextReview` al fallar devuelve `dueAt` ≥ mañana (test) |
| **R7** | **Tu última derrota de rápida, a un tap.** Bloque en la portada con rival, apertura y resultado, enlazado a `/partida/[id]` | Llegar a la última derrota cuesta 5 taps y un scroll horizontal no señalizado. Es la entrada del ciclo | 3 | PED-07 · UX-01, UX-03 | Nueva | Alto | S | R1 | `app/page.tsx`, `lib/data.ts` | Desde la portada, 1 tap llega a `/partida/[id]` de la derrota de rápida más reciente; si no hay, el bloque dice "ninguna derrota de rápida pendiente" |
| **R8** | **El panel de patrones deja de mentir.** Quitar la tasa estructuralmente imposible, umbral mínimo de ejercicios distintos, y `empeora_la_posicion` tratado como residuo | `aciertos` se calcula bajo `concepto is not null` y `concepto` solo se escribe al fallar: el 0 % no puede valer otra cosa. Y 170 intentos sobre 3 ejercicios son 3 observaciones | 3 | BI-14 · PED-15 · UX-12 | Nueva | Medio-alto | S | — | `supabase/migrations/0011_*.sql`, `app/entrenador/page.tsx` | El panel no muestra ningún 0 % estructural; con menos de 5 ejercicios distintos no se muestra; `empeora_la_posicion` aparece separado como "sin patrón reconocido" |
| **R9** | **Bugs de `/partida/[id]`.** `<Ayuda>` (un `<details>`) dentro de un `<p>`, en dos lugares: error de hidratación. `key` faltante en `GameReview`. `EvalChart` cuenta los graves de los dos bandos mientras la tarjeta cuenta solo los de Gabriel | Ocho errores de consola en la mejor pantalla de la app, y dos números distintos para lo mismo a 300 px de distancia | 2 | UX-14 · inventario §6.2f,g | Nueva | Medio | S | — | `app/partida/[id]/page.tsx`, `components/GameReview.tsx`, `components/charts/EvalChart.tsx` | Cero errores de consola al abrir `/partida/[id]` a 390 px y a 1280 px; la tarjeta y el pie del gráfico dicen el mismo número, o el pie dice explícitamente que cuenta los dos bandos |
| **R10** | **Contraste AA y tablas legibles en celular.** `--color-apagado` pasa a ≥4,5:1 sobre `--color-panel`; las tablas señalizan que hay scroll horizontal | `#5e6b65` sobre `#111714` da **3,26:1** y se usa en texto de 10,5-11 px (ejes, eyebrow, calendario). Las tablas se cortan en cinco pantallas sin ninguna señal, y son la vista accesible declarada de cada gráfico | 1 | UX-08, UX-15 | Nueva | Medio | S | — | `app/globals.css`, `components/ui/table.tsx` | El ratio calculado de `--color-apagado` sobre `--color-panel` es ≥4,5:1; en `/registro` a 390 px hay una señal visible de que la tabla continúa |
| **R11** | **Formato base visible.** Mostrar el control de tiempo real junto al conteo de rápida, usando `formatTimeControl` | 19 partidas en 15+10 contra 2.569 en 10+0: su "rápida" no es la del plan. Y la dimensión de formato tiene que existir **antes** de que el botón de R6 lo mande a 15+10, o las partidas nuevas dejan de ser comparables | 3 | BI-20 · PED-20 · UX-09 | Nueva | Medio | S | R6 | `app/page.tsx`, `lib/data.ts` | La portada muestra el desglose por formato del mes en curso ("15 de rápida: 15 en 10+0, 0 en 15+10") |

### Fase 2 · El ciclo de la derrota

**Objetivo:** cerrar el lazo entre perder, revisar y entrenar. Es la fase que convierte la app de
panel en entrenador.
**Resultado visible:** puede abrir su derrota en modo ciego, marcar dónde cree que se perdió,
contrastar con el motor, y entrenar los errores de esa misma partida.

| ID | Descripción | IDs de origen | Imp. | Esf. |
|---|---|---|---|---|
| F2-01 | `game_reviews` y la cola de derrotas sin revisar (portada + filtro en `/registro`) | PED-07 · UX-03 · BI-21 | Alto | M |
| F2-02 | Modo "Primero yo" en `/partida/[id]`: ciego por defecto en derrotas, marcar ply, motivo de lista cerrada, revelar y **contrastar** | PED-06 · UX-04 · BI-21 | Alto | M |
| F2-03 | Sesión dirigida: los ejercicios de las derrotas de rápida de los últimos 7 días primero; chips de patrón; "¿qué pasó?" de un tap al fallar | PED-10, PED-18 · UX-13 · BI-15 | Alto | M |
| F2-04 | Las cuatro vistas de `/reloj` ganan `time_class`, y la página fija rápida | BI-07 · PED-19 | Alto | S |
| F2-05 | Backfill de rápida con meta acotada: las ~300 más recientes y `n_diverged ≥ 10` en las 5 líneas del repertorio (~578 min de Actions, 29 % del cupo mensual) | BI-13 · PED-04 | Alto | S |

### Fase 3 · Las dos debilidades, medidas

**Objetivo:** que el alumno pueda responder "¿dejé de colgar piezas?" y "¿estoy aprendiendo a
convertir?". Depende de la cobertura que producen R3 y F2-05.

| ID | Descripción | IDs de origen | Imp. | Esf. |
|---|---|---|---|---|
| F3-01 | North Star: piezas colgadas por partida de rápida, con su serie mensual, en la portada | PED-13 · BI §5 (S1) | Alto | M |
| F3-02 | S1 (PVR por jugada) y S3 (cobertura) al lado de la North Star | BI §5 | Medio | S |
| F3-03 | Conversión de ventaja: partidas que llegaron a +200 y no ganó, con la lista enlazada | PED-14 · BI-22 | Alto | M |
| F3-04 | Blunders del rival que no castigó | PED-14 · BI C4 | Medio | M |
| F3-05 | Serie de mejora en "Estás mejorando", con su `n` y su banda | PED-05 · BI F1 | Alto | S |

### Fase 4 · Repertorio y ciclo

| ID | Descripción | IDs de origen | Imp. | Esf. |
|---|---|---|---|---|
| F4-01 | Repertorio declarado: "llegaste a tu repertorio en X de N" y "qué te juegan contra el Ponziani" (la mitad del rendimiento no necesita motor y se publica ya) | PED-16 · BI-11 | Alto | M |
| F4-02 | Tema de la semana derivado de una fecha de inicio y una lista de 8 en código, sin pantalla de ajustes; ordena la cola de ejercicios | PED-11 · BI-21 · UX (cruzada) | Medio-alto | M |
| F4-03 | `rated` en la ingesta y filtro por defecto en las vistas de rendimiento | BI-19 | Medio | S |
| F4-04 | Limpieza: vistas superadas anotadas con `comment on view`, `openingResolution()` borrada, capa 4 de `CONFIANZA.md` actualizada a la reconciliación por UUID | BI-18 | Bajo | S |

---

## 8. Orden global y dependencias

```
Fase 1  R1 R2 R4 R6 R7 R8 R9 R10 R11   (sin dependencias entre sí, salvo R4←R1, R7←R1, R11←R6)
        R3  ── desbloquea todo lo de cobertura
        R5  ── independiente del motor: re-derivación desde el PGN

Fase 2  F2-04 (independiente)   F2-01 → F2-02 → F2-03
        F2-05 ← R3

Fase 3  F3-01..F3-05  ← R3 + F2-05   (sin cobertura, no hay serie)
        F3-01 ← R5 (la fase corregida cambia el corte)

Fase 4  F4-01 (mitad HOY, mitad ← F2-05)   F4-02 ← F2-03   F4-03 y F4-04 independientes
```

**La dependencia crítica es R3.** Sin devolver las 1.406 partidas de rápida a la cola y sin
invertir el orden del analizador, la Fase 3 entera es inalcanzable: la North Star se calcularía
sobre 108 partidas repartidas en 23 meses. El costo del desbloqueo son ~2.480 partidas ≈ 578
minutos de GitHub Actions ≈ 29 % del cupo mensual gratuito, en 2-3 corridas. **El bloqueo es de
criterio, no de presupuesto.**

---

## 9. Lo que se recomienda NO construir

| Idea | Por qué no |
|---|---|
| **Motor de insights tipo Lichess** (métrica × dimensión × filtro) | Un cubo OLAP para un solo usuario invita a explorar en vez de entrenar. La app debe responder cinco preguntas bien y **decir la conclusión** |
| **Rachas, notificaciones, ligas, insignias** | Prohibidas por regla del proyecto desde la Fase 4, y la regla es correcta: premian abrir la app, que es el riesgo principal declarado |
| **Radar de temas, estadísticas de puzzles, historial de precisión** | Mirar el espejo. La métrica de progreso son dos números, no un tablero |
| **Prep de rivales** | Juega en línea contra desconocidos. Sin caso de uso |
| **Un curso de finales o lecciones propias** | No hay que construir un curso: hay que ordenar la cola de ejercicios propios por el tema de la semana |
| **Explorador de aperturas de Lichess como pantalla** | Como consulta puntual dentro del modo ciego ("te saliste de la teoría en la jugada 6") sí pasa el filtro; como pantalla de exploración, no |
| **Tiempo de estudio en minutos** | Métrica de uso, tediosa de capturar, y cae de lleno en el riesgo principal. La adherencia se mide por **derrotas revisadas**, que es un acto con producto |
| **Un `<details>` para esconder los gráficos planos de `/ritmo`** | `<details>` ya significa "la tabla exacta" en cinco páginas, y un `<details>` cerrado es un anzuelo. La evidencia de un resultado nulo son los números con su intervalo, no una barra plana |
| **Una pantalla de ajustes para el tema de la semana** | Se deriva de una fecha de inicio y una lista en código. Cero interfaz de captura |

---

## 10. Riesgos y preguntas abiertas para Gabriel

1. **¿Confirmas que 4.777 partidas marcadas `skipped` fueron un accidente y no una decisión
   tuya?** Ningún camino del código las explica. La Fase 1 las devuelve a `pending`, lo cual es
   reversible, pero si las excluiste a propósito, dilo antes.
2. **¿El formato base sigue siendo 15+10?** Tienes 19 partidas en 15+10 y 2.569 en 10+0. Si en la
   práctica tu rápida es 10+0, el plan debería decir 10+0 y el botón de la portada debería
   mandarte ahí. Si sigue siendo 15+10, la app va a marcar la brecha cada mes.
3. **¿Quieres que la portada nombre la bala?** Es lo que se implementa: el número, sin castigo y
   sin racha, al lado de la meta de tu plan. Si prefieres que viva en otra pantalla, se mueve.
4. **¿Cuánto tiempo de GitHub Actions estás dispuesto a gastar en el backfill de rápida?** El
   desbloqueo completo son ~578 min, el 29 % del cupo mensual gratuito. La alternativa acotada
   (~300 partidas recientes + las 5 líneas del repertorio) cuesta bastante menos y alcanza para
   la Fase 3.
5. **¿El ciclo de 8 semanas tiene una fecha de inicio?** Si me das una, el tema de la semana se
   deriva sin ninguna pantalla de configuración.

---

## 11. Prompts por fase

Los prompts autocontenidos de cada fase están en `docs/review/prompts/`, en el mismo formato que
`docs/prompts/`:

- `docs/review/prompts/revision-fase1.md` — los once ítems R1..R11, con sus criterios de
  aceptación.
- `docs/review/prompts/revision-fase2.md` — el ciclo de la derrota.
- `docs/review/prompts/revision-fase3.md` — las dos debilidades medidas.
- `docs/review/prompts/revision-fase4.md` — repertorio y ciclo de 8 semanas.
