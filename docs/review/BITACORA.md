# Bitácora de la implementación

Registro de lo que se construyó a partir de `docs/review/PLAN-REVISION.md`, qué criterios se
cumplieron, qué se ajustó y qué supuestos se tomaron. Una entrada por fase.

---

## Preparación

**Rama:** `feat/plan-integral`, en el worktree `/home/user/chessito-review`, a partir de
`origin/claude/chessito-plan-integral-yftrk6`.

**Comparación entre el commit revisado y el estado actual:** ninguna diferencia.
`origin/main` y la rama de trabajo estaban las dos en `1855bd7`, que es exactamente el commit
sobre el que se hizo la revisión (`git rev-list --count 1855bd7..origin/main` → 0). **Ningún ítem
del plan quedó obsoleto ni cambió de alcance por trabajo de la sesión constructora.**

**Cómo se verificó cada cosa, dado que no hay acceso al deploy ni a la service role key:**

1. **SQL:** se levantó un **PostgreSQL 16 local** (`/usr/lib/postgresql/16/bin`) y se aplicaron
   las once migraciones en orden, de cero. Es el mismo Postgres 16 contra el que el proyecto
   declara haber verificado el esquema. Las migraciones **no** se aplicaron a `chessito-dev` ni a
   `chessito-prod`: eso lo hace Gabriel con el workflow `migraciones`.
2. **Chequeos nuevos:** `tests/revision.integration.test.ts`, contra ese Postgres, con la forma
   exacta de los datos que la revisión encontró en producción. Los cuatro se prueban **en rojo**:
   un invariante que nunca se probó en rojo no es un invariante.
3. **UI:** `next dev` contra el arnés de datos (§6 del inventario), capturas con Playwright a
   390 px y 1280 px, medición de `scrollWidth` contra `innerWidth`. El arnés se revirtió antes de
   cada commit; no queda un solo archivo suyo en la rama.
4. **Contraste:** calculado con la fórmula de WCAG sobre los tokens reales, no a ojo.

---

## Fase 1 · Que la app hable de rápida y diga lo que ya sabe

**Estado: completa.** Los once ítems (R1..R11) implementados y verificados.

### Qué se hizo, ítem por ítem

| ID | Estado | Criterio de aceptación | Cómo se verificó |
|---|---|---|---|
| **R1** | ✅ | El calendario enciende solo los días con rápida; el rating es el de rápida; aparece la palabra "bala" con su número | `capturas/despues/portada-390.png`: 5 días encendidos de 15 jugados, "RATING DE RÁPIDA", "436 de bala este mes. Tu plan dice cero hasta 1500." |
| **R2** | ✅ | `/errores` declara su propia base; la vista nueva suma su `n_games` | `capturas/despues/errores-390.png`: "Basado en 108 de 2.588 partidas de rápida analizadas, con 2.480 en cola". Test: `v_cobertura_analisis suma su propio n_games` |
| **R3** | ✅ | 0 `skipped` sin motivo; `claimBatch` con rápida antes que blitz; tres chequeos nuevos | Cuatro tests de integración, incluidos `skipped_sin_motivo` y `cobertura_sesgada_por_clase` probados en rojo y en verde |
| **R4** | ✅ | `/errores` con la frase y la advertencia; `/ritmo` dice "no hay efecto" con su `n` | Capturas: "No. Fallas el 3.4% … y el 18.4% …"; "No hay tilt medible. Medido sobre 1.999 partidas… los rangos se solapan por completo" |
| **R5** | ✅ | El "final" cae a ≈17 % y el medio juego sube sobre 50 %; `moves:rephase` idempotente | Corrido de verdad contra 60 partidas reales sembradas en el Postgres local: **66,5 % → 16,7 % de final, 54,2 % de medio juego**. Segunda corrida: `jugadas_cambiadas: 0` |
| **R6** | ✅ | Nunca un número mayor que 10 como tarea; el contador puede valer 1/3 y 2/3; hay enlace a jugar | Captura: "Tres cosas y quedas al día · 0/3 hoy", "Jugar 1 partida de rápida" con botón, "3 ejercicios · ~8 min, medido con tus propios intentos" |
| **R7** | ✅ | 1 tap desde la portada a la última derrota de rápida | Captura: "Revisar tu derrota contra id_okon · 10 min · con blancas · 25 jul" con botón "Revisar" |
| **R8** | ✅ | Sin ningún 0 % estructural; umbral de 5 ejercicios distintos; residuo aparte | Captura: con 3 ejercicios distintos el panel **no se muestra**, en vez de mostrar tres líneas en 0 %. Test: `v_conceptos_panel` no expone `aciertos` |
| **R9** | ⚠️ parcial | Cero errores de consola; tarjeta y gráfico consistentes | De **8 errores a 1**. Los de hidratación y el desajuste de conteo, resueltos. Ver el ajuste de abajo |
| **R10** | ✅ | `--color-apagado` ≥4,5:1; señal de scroll en las tablas | Calculado: 5,11:1 sobre `panel` y 4,69:1 sobre `panel-alto` (antes 3,26 y 2,99). Degradado en el borde derecho bajo `sm` |
| **R11** | ✅ | Desglose por formato en la portada | Captura: "15 en 10 min" junto al conteo de rápida |

### Ajustes respecto del plan

**R9 · el `key` que falta no es nuestro.** El plan pedía cero errores de consola en
`/partida/[id]`. Se arreglaron los dos que sí eran de la app (el `<details>` dentro de un `<p>`,
en dos lugares, y el desajuste entre "GRAVES 1" y "2 errores graves marcados"), y queda **uno**:
`Each child in a list should have a unique "key" prop`. Está en
`react-chessboard@5.12.1`, que mapea sus flechas con
`arrowsToDraw.map((arrow, i) => ...)` sin `key`
(`node_modules/react-chessboard/dist/index.esm.js:5267`). React lo atribuye a `GameReview` porque
es el componente propietario más cercano, pero el código es de la librería. Es una advertencia de
desarrollo y no aparece en un build de producción. **No se parcheó `node_modules` ni se fijó otra
versión:** ninguna de las dos cosas estaba en el alcance de la fase, y la advertencia no afecta
lo que ve el usuario. Queda anotado para cuando se actualice la dependencia.

**R4 · el criterio de "hay efecto" tuvo que endurecerse a mitad de camino.** La primera versión
comparaba la cota de Wilson del mejor corte contra el porcentaje **bruto** del peor. Con eso, el
panel de fatiga anunció *"Rindes peor en la 4ª partida de la sesión (44 % sobre 276) que en la 5ª
(51 % sobre 199)"* — un hallazgo falso por **0,4 puntos** de diferencia, y justo en el panel que
la revisión decía que mide efecto nulo. Se corrigió a comparar contra la cota **superior**
aproximada del peor (`2·bruto − wilson`). Con el criterio nuevo, la fatiga y el tilt dicen "no hay
efecto" y el corte horario sobrevive, que es lo que los datos sostienen. **Lo encontró la captura,
no un test**: es exactamente el tipo de hallazgo falso contra el que existe el umbral de 20 del
proyecto, colándose por el otro lado.

**R8 · el umbral se aplicó sobre ejercicios, no sobre intentos.** El plan decía "umbral mínimo de
ejercicios distintos (5)". Se implementó así y tiene una consecuencia visible que conviene decir:
con los datos de hoy (3 ejercicios distintos por concepto) **el panel entero desaparece**. Es lo
correcto —170 intentos sobre 3 ejercicios son 3 observaciones— pero significa que el panel vuelve
recién cuando el entrenador tenga más volumen.

**R1 · un arreglo extra que no estaba en el plan.** El bloque "Esto no mejora" de la portada
mostraba "Sin patrón (ejercicios) · 202 vencidos" como si fuera una debilidad. `theme = null` es
el residuo del detector de patrones, no algo que el jugador haga mal: se filtra, con el mismo
criterio que el panel del entrenador.

**R6 · `dueByTheme` y la agregación en TypeScript.** El plan mencionaba BI-16 de pasada; se
resolvió: `dueByTheme` traía hasta 1.000 filas y agrupaba en memoria. Ahora hay vista
(`v_ejercicios_vencidos_por_tema`). `sessionToday` sigue agregando en TypeScript y **queda
pendiente**: su lógica de "primer intento del día local" depende de la zona horaria y no se puede
mover a SQL sin rehacerla, lo que excede el alcance de un quick win.

**`lib/database.types.ts` se regeneró, no se editó a mano.** Se corrió `pnpm db:types --db-url`
contra el Postgres local con las once migraciones aplicadas, que es para lo que existe ese modo
del script. Conviene volver a correrlo contra la base real después de aplicar 0011.

### Supuestos tomados

Las cinco preguntas abiertas de `PLAN-REVISION.md` §10 no bloquearon nada. Lo que se asumió:

1. **Las 4.777 partidas `skipped` fueron un accidente.** Ningún camino del código las explica. La
   migración las devuelve a `pending` **solo si tienen jugadas extraídas y ningún motivo válido**,
   y deja la marca para revertirlo (`skip_reason is null` + `analysis_state = 'pending'`). No se
   borra ninguna fila. Si fue deliberado, se revierte con un `update`.
2. **El formato base sigue siendo 15+10.** El botón "Jugar" de la portada apunta al lobby de
   chess.com, no a un emparejamiento de 15+10: mandarlo a un formato concreto sin confirmarlo
   sería decidir por Gabriel. El desglose por formato (R11) ya deja la brecha a la vista.
3. **La portada nombra la bala.** Confirmado por Gabriel antes de implementar.
4. **El umbral del final es 13 puntos de material no-peón.** Es el criterio de `01-pedagogia.md`,
   elegido sobre el de `03-bi.md` (≤3 piezas por bando) porque deja torre + pieza menor por bando
   todavía en medio juego. La tabla de las cinco alternativas medidas está en el comentario de
   `lib/chess/phase.ts`, para que la decisión sea auditable y reversible.
5. **El backfill no se corrió.** Ni `moves:rephase` ni el análisis de rápida. Ambos escriben en
   producción y se disparan después de mergear, igual que se hizo con `moves`, `analyze` y
   `puzzles` en las fases anteriores.

### Lo que sigue funcionando (sección 2 de `PLAN-REVISION.md`)

Verificado tras cada commit: `pnpm typecheck`, `pnpm lint`, `pnpm test` (**329 tests, 26
archivos, todos en verde**) y `pnpm build`. En particular:

- Los **diez chequeos originales** de `v_data_quality` siguen existiendo y en verde; los cuatro
  nuevos se suman (el test que contaba diez ahora cuenta catorce, actualizado a propósito).
- La **extracción de relojes** no se tocó: `moves:rephase` solo escribe `phase`.
- Los **dos pasos de signo** y su test con motor falso, intactos.
- El **pipeline de dos transportes**: las dos operaciones nuevas (`loadGamesForRephase`,
  `updateMovePhases`) están en la interfaz y en **las dos** implementaciones, con la vista
  `v_games_para_refase` para el camino de PostgREST, igual que `v_games_pending_moves`.
- `min-w-0` en `Panel`: **cero desborde horizontal** en las nueve pantallas, a 390 px y a 1280 px.
- Ninguna migración aplicada fue editada. `v_analysis_coverage`, `v_conceptos_fallados_rapida` y
  el resto quedan intactas; lo nuevo son vistas nuevas.

### Lo que hay que hacer después de mergear

En este orden:

1. **Aplicar la migración 0011** con el workflow `migraciones` (o `pnpm db:push`). Sin ella,
   `/errores`, `/entrenador` y la portada leen vistas que no existen.
2. **Correr `moves:rephase`** una vez, con el workflow **`moves` en modo `refasear`** (se dispara
   desde el celular, como todo lo demás). Hasta que corra, `/errores` y `/reloj` siguen mostrando
   la distribución de fases vieja: el código está arreglado y los datos no.
3. **Correr `pnpm db:types`** contra la base real, para que los tipos generados salgan de ahí y
   no del Postgres local.
4. **Disparar el análisis** desde `/salud`. Con 0011 aplicada hay ~2.480 partidas de rápida en
   cola y la cola ahora las sirve primero.
5. Revisar `/salud`: los cuatro chequeos nuevos van a estar en **rojo** hasta que los pasos 2 y 4
   avancen. Eso es correcto y es el punto: antes estaban los diez en verde mientras la mitad del
   histórico estaba fuera del motor.

---

## Fases 2, 3 y 4

No implementadas en esta sesión, por alcance acordado con Gabriel: la Fase 1 son los quick wins
de alto impacto, y las siguientes quedan como prompts autocontenidos en
`docs/review/prompts/revision-fase2.md`, `revision-fase3.md` y `revision-fase4.md`.

La dependencia crítica está anotada en `PLAN-REVISION.md` §8: la Fase 3 (las dos debilidades
medidas, y la North Star) no se puede construir sin la cobertura que producen R3 y F2-05.

---

# Fase 2 · El ciclo de la derrota

Cierra el lazo entre perder, revisar y entrenar. Cuatro ítems construidos; el quinto (F2-05) es
una corrida del motor, no código.

| ID | Qué se construyó | Criterio | Estado |
|---|---|---|---|
| F2-04 | `/reloj` separa clases de tiempo (0012) | ninguna cifra mezcla clases | ✅ 6 tests |
| F2-01 | `game_reviews` y la cola de derrotas (0013) | marcar revisada quita la tarea | ✅ 7 tests |
| F2-02 | Modo "Primero yo" en `/partida/[id]` | ningún número del motor hasta confirmar | ✅ 9 tests |
| F2-03 | Sesión dirigida, tanda por partida y "¿qué pasó?" (0014) | la prioridad gana sobre la fecha | ✅ 6 tests |
| F2-05 | Backfill de rápida | ≥300 de rápida en `done` | ✅ 1.628 y subiendo |

357 tests en verde. `typecheck`, `lint` y `build` también. Capturas a 390 px y 1280 px de las seis
pantallas tocadas, en `docs/review/capturas/fase2/`.

## Lo que cambió respecto del plan, y por qué

1. **La cola de derrotas se acotó a 30 días.** El plan decía "máximo tres en la portada, y si son
   40 decir «y 37 más»". Medido en producción: son **1.191**, así que el mensaje habría sido "y
   1.188 más" — la deuda completa que la regla manda no mostrar. La distribución (1 en 7 días, 6
   en 30, 16 en 90) decidió la ventana. La lista completa vive en `/registro`.

2. **El concepto elegido se guarda en una segunda escritura**, no como campo de `recordAttempt`.
   El intento tiene que quedar guardado en el momento del fallo porque alimenta SM-2; esperar la
   respuesta de la pregunta significaría perder el intento entero si se cierra la pestaña.

3. **Las opciones de "¿qué pasó?" se barajan con semilla estable por ejercicio.** Fijas harían que
   la correcta se aprenda por posición; al azar en cada render harían imposible tocar la que
   querías.

4. **No se implementó el "tema de la semana"** como segundo nivel de prioridad: es F4-02, y sin él
   la cola tiene dos niveles en vez de tres. Los chips de patrón cubren el caso manual.

## Supuestos tomados

1. **Siete días para la prioridad de la sesión, treinta para la cola de revisión.** Son ventanas
   distintas a propósito: revisar es saldar una cola, entrenar es aprovechar que todavía recuerdas
   la partida.
2. **El botón de "entrenar esta partida" sirve la tanda aunque SM-2 no la tuviera programada**,
   mismo criterio que `puzzleAt` desde la Fase 6.
3. **`is_book` se conserva en modo ciego.** Sale de `openings`, no de Stockfish.
4. **`v_reconocimiento` lee la tasa sobre lo contestado, no sobre todos los fallos.** No contestar
   es otra cosa que no reconocer el error.
5. **Las capturas salen del arnés con datos reales de producción más tres filas inventadas** (dos
   derrotas extra en la cola, para ver el bloque con más de una fila) y las vistas de 0012-0014
   derivadas en JavaScript, porque esas migraciones todavía no están aplicadas en producción.
   Sirven para verificar **layout**, no cifras.

## Lo que hay que operar después de mergear

1. **Aplicar 0012, 0013 y 0014** con el workflow `migraciones` en modo `aplicar`, desde `main`.
   Sin ellas, `/reloj`, la portada y el entrenador leen vistas que no existen.
2. Nada más. El motor ya está corriendo y la ingesta encadena `moves:extract` sola.
