# Plan de construcción

Cuatro fases. Cada una termina con algo que se puede abrir y usar, no con un informe.

`docs/ENGINEERING.md` define los estándares que aplican a todas: tipado estricto, tests, CI en
verde, migraciones versionadas. Una fase con el CI en rojo no está terminada.

---

## Fase 1 · La app en el aire

**Al terminar tienes: una URL con tu app funcionando, protegida con tu email, mostrando tus
partidas reales.**

Esto es lo que hoy no existe y es lo primero que hay que tener.

### Alcance

**Infraestructura**
- Proyecto Next.js App Router con TypeScript strict, Tailwind y pnpm
- Migración `0001_init.sql` aplicada a Supabase, tipos generados con `pnpm db:types`
- CI en GitHub Actions: lint, typecheck, test y build en cada push
- Despliegue automático en Vercel desde la rama principal
- `lib/env.ts` validando todas las variables de entorno con Zod al arrancar
- Auth con Supabase OTP por email, signups deshabilitados, gate contra `OWNER_EMAIL`

**Datos**
- Carga de las aperturas de Lichess a la tabla `openings`, resueltas por EPD
- Ingesta idempotente desde la API de chess.com, con validación Zod en el borde, reintentos con
  backoff, y respeto del 429
- Cálculo de sesiones, número de partida en la sesión y resultado previo
- Cron diario en Vercel que refresca el mes actual y el anterior

**Interfaz**
- `/` portada con el número principal: partidas de rápida este mes contra la meta
- `/aperturas` rendimiento por apertura y color, con su n
- `/ritmo` hora del día, número de partida en la sesión, y qué pasa tras una derrota
- `/registro` listado de partidas con filtros

**Criterios de aceptación**
- La URL de Vercel abre, pide tu email, y muestra tu histórico completo
- CI en verde
- Todas las páginas responden bajo 300 ms
- Ninguna vista se muestra sin su n; los cortes con n menor a 20 salen atenuados

---

## Fase 2 · El reloj

**Al terminar tienes: una página nueva que te dice dónde se te va el tiempo y si tus jugadas
rápidas son las malas.**

- Tabla `moves` poblada desde el PGN: jugada, notación, fase, jugada de libro, reloj y tiempo
  por jugada
- Página `/reloj`: tiempo por número de jugada, distribución de tiempos, porcentaje de jugadas
  bajo 3 segundos por fase, y en qué momento se te acaba el tiempo en las derrotas por reloj

**Por qué va antes que el motor:** construye y prueba la tabla `moves` una fase antes de que el
motor la necesite. Cuando llegue la Fase 3, escribir evaluaciones es actualizar filas que ya
existen y ya están testeadas, no rediseñar el esquema con el motor encima. Esto es deliberado.

**Criterios de aceptación**
- Cero filas con tiempo por jugada negativo
- Para una partida de muestra con incremento, la suma de tiempos reconstruye el control de
  tiempo declarado
- Tests de la fórmula del reloj en verde, con fixtures de PGN reales

---

## Fase 3 · Stockfish

**Al terminar tienes: cada partida tuya analizada jugada por jugada, y una página que te dice
qué error cometes más y en qué fase.**

- `lib/engine/`: cliente UCI que levanta Stockfish nativo como proceso hijo
- `scripts/analyze.ts`: toma partidas pendientes, las analiza, escribe resultados, una
  transacción por partida, reanudable
- `.github/workflows/analyze.yml`: instala Stockfish con apt y corre el analizador. Programado
  a diario, y con botón manual para dispararlo desde el celular
- Los dos pasos de signo, con sus tests unitarios obligatorios
- Clasificación por caída de probabilidad de victoria
- `/errores`: tasa de blunders por partida y por fase, y el cruce con el tiempo por jugada
- Cobertura del análisis visible en toda página que use datos del motor
- Respaldo NDJSON de las evaluaciones a Supabase Storage

**Criterios de aceptación**
- La correlación entre tu ACPL calculado y la accuracy de chess.com es claramente negativa, del
  orden de -0,6 o más fuerte. Esa es la prueba de que los signos están bien
- Las últimas 100 partidas de rápida analizadas
- Tests de signo y de clasificación en verde

---

## Fase 4 · El entrenador

**Al terminar tienes: un tablero que te sirve tus propias posiciones perdidas para que las
vuelvas a jugar.**

- Generación de ejercicios desde tus errores graves
- Filtro de calidad con MultiPV, para no marcarte como error una jugada ganadora distinta
- Tablero con `react-chessboard`, validación con `chess.js`
- Repetición espaciada tipo SM-2 simplificado

**Criterio de aceptación**
- Puedes resolver 10 ejercicios seguidos sin que ninguno sea injusto

---

## Fase 3.5 · El laboratorio (opcional)

Ruta `/lab` con Stockfish en WebAssembly para analizar una partida puntual al momento, sin
esperar al workflow. Build de un solo hilo, sin cabeceras COOP/COEP.

Si se usa el build multihilo, las cabeceras COOP/COEP van en `middleware.ts` acotadas a esa
ruta, **nunca globales en `next.config`**: `COEP: require-corp` bloquea todo recurso externo que
no mande `Cross-Origin-Resource-Policy`, incluidas las imágenes de chess.com.

---

## Riesgos del proyecto y cómo se mitigan

**1. La app reemplaza al ajedrez.** Construir analítica es más cómodo que perder partidas de
rápida un sábado en la mañana. Una app de análisis sin partidas nuevas es un museo.
*Mitigación:* el número principal de la portada es partidas jugadas, no tasa de blunders.

**2. Purgatorio de backfill.** El análisis queda a medias para siempre y se pierde la confianza
en los dashboards.
*Mitigación:* motor en GitHub Actions y no en el navegador, presupuesto de nodos en vez de
profundidad, saltar jugadas de libro y posiciones ya decididas, analizar de lo más reciente
hacia atrás, y mostrar cobertura en vez de fingir que los datos están completos.

**3. Conclusiones falsas por muestra chica.** Un corte calculado sobre 12 partidas es ruido, y
entrenar sobre ruido un mes destruye la credibilidad de la herramienta.
*Mitigación:* n en toda vista, umbral de 20 para mostrar un corte, cotas de Wilson, y para tilt
y fatiga agrupar también blitz y bala, donde hay cientos de partidas.

**4. Evaporación de datos.** Los proyectos gratis de Supabase se pausan tras una semana de
inactividad, que el cron resuelve, y ocasionalmente se pierden.
*Mitigación:* Postgres es caché, chess.com es la fuente, la ingesta es idempotente y el PGN
crudo se guarda entero. Lo único irrecuperable son las evaluaciones y el historial del
entrenador, que se respaldan a Storage.
