# 00 · Benchmark

**Método:** búsqueda web (septiembre 2026) más conocimiento previo del dominio. Lo verificado con
búsqueda lleva fuente; lo que sale de conocimiento previo va marcado *(sin verificar)*.

**Filtro aplicado a todo:** el riesgo principal de Chessito es que construir o usar la app
reemplace a jugar ajedrez. Un patrón que aumenta el tiempo mirando pantallas sin aumentar
partidas jugadas, derrotas analizadas o errores corregidos **no aplica**, por bueno que sea.

---

## Tabla

| Referente | Funcionalidad o patrón | Por qué funciona | Aplica | Idea concreta para Chessito |
|---|---|---|---|---|
| **Lichess** | **Learn from your mistakes**: tras el análisis, un botón te lleva a la primera posición donde erraste y te pide **encontrar la jugada**, no te la muestra ([blog](https://lichess.org/@/lichess/blog/learn-from-your-mistakes/WFvLpiQA)) | Convierte el informe en ejercicio en el mismo gesto. No hay que decidir "ahora voy a entrenar": entrenar es el paso siguiente de revisar | **Sí** | Chessito ya tiene las piezas (`/partida` → "Entrenar esta posición", `GameReview.tsx:450`), pero el flujo empieza en `/registro`. Falta el camino **derrota → revisión → ejercicios de esa derrota**, en un tap desde la portada |
| **Lichess** | Un blunder no se marca como tal si la posición ya estaba ganada o perdida; y se contrasta contra la base de maestros antes de llamarlo error ([ídem](https://lichess.org/@/lichess/blog/learn-from-your-mistakes/WFvLpiQA)) | Evita el ejercicio injusto, que es lo que destruye la confianza en un entrenador automático | **Sí, parcialmente hecho** | `is_decided` ya cubre la primera mitad (`lib/analysis/classify.ts:20`). La segunda no: no hay contraste contra una base de maestros ni contra el explorador de Lichess |
| **Lichess** | **Insights**: motor de respuestas con métrica × dimensión × filtro (tiempo por jugada, fase, pieza movida, ganancia de rating) ([blog](https://lichess.org/blog/VmZbaigAABACtXQC/chess-insights)) | El jugador formula su propia pregunta en vez de elegir de un menú | **No** | Un cubo OLAP para un solo usuario es un juguete de analista. Chessito debe responder **cinco preguntas bien** y decir la conclusión, no ofrecer mil cortes |
| **Lichess** | Métricas **Opportunism** (con qué frecuencia castigas el blunder del rival) y **Luck** (con qué frecuencia no te castigan el tuyo) ([blog](https://lichess.org/blog/VmZbaigAABACtXQC/chess-insights)) | Separan "jugué bien" de "gané". Son las dos mitades que faltan cuando solo se mide el propio error | **Sí, adaptado** | Chessito solo evalúa las jugadas de Gabriel. Evaluar también las del rival es doblar el costo de motor; pero **"blunders del rival que no castigué"** es exactamente el eslabón entre táctica y resultado, y es la debilidad "no sé qué hacer" vista desde el otro lado |
| **Lichess** | **Puzzle Dashboard**: aciertos por tema con un radar, y "tus temas más débiles" | Dirige el entrenamiento a lo peor, no a lo siguiente en la lista | **Sí** | Chessito tiene `theme` (3 patrones) y `concepto` (`v_conceptos_fallados_rapida`), pero 203 de 400 ejercicios no tienen `theme` y solo 16 vienen de rápida: el panel existe y está vacío |
| **Lichess** | **Practice**: lecciones de posiciones básicas (mates elementales, finales de rey y peón) contra el motor | Convierte un tema teórico en repeticiones sobre el tablero | **Sí, adaptado** | El ciclo de 8 semanas del alumno tiene dos semanas de finales (rey y peón, torre). No hay que construir un curso: basta poder **filtrar los ejercicios propios por el tema de la semana** |
| **chess.com** | **Game Review**: un recorrido narrado jugada a jugada con "momentos clave" y precisión 0-100 | El resumen se lee en 30 segundos y da un punto de entrada | **Sí, ya hecho** | `/partida/[id]` ya tiene "Momentos clave" y precisión propia declarada como cálculo propio. No romper eso |
| **chess.com** | **Insights**: rating actual y máximo, partidas totales, rendimiento por apertura filtrado por control de tiempo ([comparación](https://www.raindropchess.com/chesscom-vs-lichess-honest-comparison-from-a-player-who-uses-both-daily/)) | El rendimiento por apertura **filtrado por clase de tiempo** es el corte que un jugador entiende sin explicación | **Sí** | `v_opening_performance` ya agrupa por `time_class`, y `/aperturas` **no** filtra por ella: mezcla bala, blitz y rápida en la misma tabla |
| **Aimchess** | Importa tus partidas, detecta debilidades estadísticas (tasa de blunder, gestión del reloj, fugas de apertura, conversión de finales) y **sirve entrenamiento dirigido a esa debilidad** ([review](https://www.raindropchess.com/aimchess-review-does-personalized-chess-training-actually-work/)) | Cierra el lazo diagnóstico → ejercicio, que es justo el eslabón que un dashboard no cierra | **Sí** | Es la tesis de Chessito y está a medio construir: el diagnóstico existe, los ejercicios existen, pero no están **enlazados por tema**. Nadie sirve "los ejercicios de la debilidad que el diagnóstico nombró" |
| **Aimchess** | Módulos con nombre: **Blunder Preventer**, **Advantage Capitalization**, **Defender**, **Opening Improver** ([ídem](https://www.raindropchess.com/aimchess-review-does-personalized-chess-training-actually-work/)) | Nombrar el módulo nombra la habilidad. "Entrenar" no dice qué estás entrenando | **Sí, adaptado** | No hacen falta 5 módulos. Uno solo, **conversión de ventaja**, es medible hoy con `moves` y `eval_cp` y ataca directo "no sé qué hacer en el medio juego" |
| **Aimchess** | Prep del rival (nivel pago) | Útil para torneos con emparejamiento conocido | **No** | Juega en línea contra desconocidos. Sin caso de uso |
| **ChessTempo** | Táctica con **modo estándar sin reloj** vs **blitz con reloj**, y calificación por acierto al primer intento | Separar "¿lo sé?" de "¿lo veo rápido?" es lo que hace honesta la repetición | **Sí, ya hecho** | SM-2 de Chessito ya califica por acierto al primer intento sin pista (`lib/spaced-repetition/sm2.ts`). No tocar |
| **Chessable** | **MoveTrainer** con repetición espaciada, y el problema declarado del **atraso**: si dejas de repasar, la deuda se acumula y come todo el tiempo de estudio; el remedio propuesto es la vista de "jugadas difíciles" para atacar lo que más cuesta ([Chessable](https://www.chessable.com/blog/using-spaced-repetition-intelligently/), [ayuda](https://support.chessable.com/en/articles/9043598-how-does-the-spaced-repetition-scheduling-work)) | Reconocen que una deuda de repaso visible y grande desmotiva más de lo que enseña | **Sí, urgente** | Chessito tiene **397 de 400 ejercicios vencidos** y la portada los muestra como "~397 min" de plan del día. Hay que **acotar la sesión** (p. ej. 10 ejercicios), priorizar por tema y no presentar la deuda entera como tarea |
| **OpeningTree** | Sube tu usuario y te dibuja **tu árbol real de aperturas**, con rendimiento por nodo y desviaciones respecto de la teoría | Responde "¿qué juego de verdad?" y "¿dónde me salgo de mi propio repertorio?", que es distinto de "¿cómo me va en la Ponziani?" | **Sí, adaptado** | Chessito ya tiene `divergence_ply` y todos los EPD por jugada. Falta el concepto de **repertorio declarado**: hoy la Ponziani aparece partida en dos filas y no hay forma de preguntar "¿qué me juegan contra ella?" |
| **DecodeChess** | Explica *por qué* una jugada es mala en lenguaje natural (amenaza, pieza colgada, debilidad estructural) | Un cp_loss no enseña; una frase sí | **Sí, ya hecho y mejor** | `lib/puzzles/explain.ts` es **determinista** (reproduce la refutación y cuenta qué se captura), sin costo ni riesgo de alucinar. Es una ventaja de Chessito, no una brecha |
| **Noctie** | Motor que juega **como un humano de tu nivel** y comenta tus partidas | Permite practicar una posición jugándola, no solo resolviéndola | **Sí, ya hecho en pequeño** | "Probar las líneas en el tablero" de la Fase 12 ya suelta el tablero tras el ejercicio. Sirve como está |
| **Explorador de aperturas de Lichess** (API pública, gratis) | Para un EPD, qué se juega en esa posición y con qué resultado a tu rango de rating | Da el "esto es lo normal" que hoy Chessito no tiene: solo sabe qué jugó Gabriel | **Sí** | Con el EPD ya calculado en `parsePgn`, una consulta puntual (no masiva) contestaría "te saliste del libro en la jugada 6 y lo que se juega acá es X" |
| **Duolingo** *(fuera del ajedrez)* | Objetivo diario pequeño y alcanzable, y la lección siguiente elegida por el sistema | Un objetivo chico se cumple; uno grande se abandona | **Sí, adaptado — con cuidado** | La portada ya tiene "Tu plan de hoy" con 2 tareas, que es correcto. Lo que falla es el tamaño: "397 ejercicios, ~397 min" no es un objetivo diario |
| **Duolingo** *(fuera del ajedrez)* | Rachas, ligas, notificaciones | Enganchan a abrir la app | **No** | Prohibido por regla del proyecto desde la Fase 4, y con razón: premia abrir la app, que es exactamente el riesgo principal. Ya se rechazó una racha en la Fase 7 |
| **Strava** *(fuera del ajedrez)* | El feed es de **actividades hechas**, no de métricas. Los análisis viven un nivel abajo | La pantalla de entrada refleja si saliste a correr, no cuántos gráficos miraste | **Sí** | Es el argumento para que la portada muestre **partidas de rápida y derrotas sin revisar**, no tasas. Chessito ya lo hace a medias: el número principal es correcto, pero el resto de la portada son tendencias y bloques vacíos |
| **Strava** *(fuera del ajedrez)* | Compara con **tu propio pasado** (tu mejor 5K, este mes vs el anterior), no con otros | Convierte un número suelto en una historia con dirección | **Sí** | Chessito tiene el bloque "Estás mejorando" **vacío** (`app/page.tsx:252`) justo donde iría esto, y tiene los datos: 23 meses de rating y de score por mes |

---

## Tres lecturas que cruzan referentes

**1. Todos los buenos cierran el lazo; Chessito lo tiene abierto en un punto.**
Lichess (mistakes → puzzle), Aimchess (debilidad → módulo) y Chessable (error → repaso) llevan
del diagnóstico al ejercicio **sin que el usuario elija**. Chessito tiene los dos extremos
construidos y de buena calidad, pero el paso "esta debilidad se entrena con estos ejercicios"
no existe: el entrenador sirve el ejercicio más vencido, sin relación con lo que dijo
`/errores`.

**2. El atraso de repetición espaciada es un problema conocido, y Chessito lo tiene en su
peor forma.** Chessable lo documenta como la falla típica. 397 de 400 vencidos, presentados
como "~397 min" en la primera pantalla, es la versión extrema.

**3. Nadie de los referentes muestra cortes sin muestra, y nadie muestra cortes que ya sabe
que son planos.** Chessito ya respeta lo primero (n≥20, Wilson, filas atenuadas). Lo segundo
no: `/ritmo` dibuja tres gráficos cuyos intervalos de confianza se solapan por completo
(ver `00-inventario.md` §3.8) y no dice que el efecto medido es nulo.
