# Chessito

App personal de análisis de ajedrez. Ingiere tus partidas de chess.com y responde cuatro
preguntas que la plataforma no te da gratis: contra qué aperturas pierdes, cuándo te desordenas
por cansancio o tilt, dónde cuelgas piezas de verdad, y si tus errores vienen cuando juegas
rápido.

La Fase 1 ya está construida: la app Next.js, la ingesta desde chess.com con reconciliación,
la carga de aperturas de Lichess y las páginas `/`, `/aperturas`, `/ritmo`, `/registro` y
`/salud`. Los pasos manuales que faltan (Supabase, Vercel, GitHub) están en
**[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**, pantalla por pantalla.

Las fases 2 a 4 siguen siendo especificación: el código lo escribe Claude Code a partir de estos
archivos.

## Empieza acá

**[COMO-EMPEZAR.md](COMO-EMPEZAR.md)**. Todo desde el navegador, sin instalar nada y gratis.

Resumen: abres cuentas gratis de Supabase y Vercel, subes estos archivos a tu repositorio de
GitHub, entras a claude.ai/code y escribes:

```
Ejecuta la Fase 1 descrita en @docs/prompts/fase1-app.md
```

## Qué hay acá

```
COMO-EMPEZAR.md                    el paso a paso operativo. Parte por acá.
COMO-USAR-CLAUDE-CODE.md           cómo operar las sesiones: una fase por sesión, plan mode, PRs
CLAUDE.md                          contexto permanente del proyecto y las trampas técnicas
PLAN.md                            las cuatro fases y sus criterios de aceptación
docs/ENGINEERING.md                estándares obligatorios: tipado, tests, CI, errores
docs/ENVIRONMENTS.md               ambientes dev y prod, ramas, secretos, cómo promover
docs/DESPLIEGUE.md                 los pasos manuales de Supabase, Vercel y GitHub
docs/CONFIANZA.md                  cómo se verifica que el análisis es confiable
docs/DECISIONES-DE-STACK.md        por qué Supabase y Vercel, qué se descartó, cómo salir
docs/DATA-SOURCES.md               API de chess.com, aperturas de Lichess, parseo de PGN
docs/ANALYSIS-SPEC.md              motor, fórmulas y umbrales de clasificación
docs/prompts/                      un archivo por fase, para invocar con @
supabase/migrations/0001_init.sql       esquema completo, verificado contra Postgres 16
supabase/migrations/0002_observability.sql  corridas, reconciliación y chequeos de calidad
.env.example                       variables de entorno
```

## Las cuatro fases

| | Qué obtienes al terminar | Cuánto |
|---|---|---|
| **Fase 1** | Una URL con tu app funcionando y tu histórico cargado | Un fin de semana |
| **Fase 2** | Análisis de tu uso del reloj | Un fin de semana |
| **Fase 3** | Stockfish clasificando cada jugada tuya | Dos fines de semana |
| **Fase 4** | Entrenador con tus propias posiciones perdidas | Un fin de semana |

Cada fase termina con algo que se puede abrir y usar. Ninguna termina con un informe.

## Cómo se construye

Como un producto, no como un script personal. `docs/ENGINEERING.md` es criterio de aceptación:
TypeScript en modo strict sin `any`, tipos de base de datos generados, validación con Zod en el
borde, tests con Vitest sobre fixtures de PGN reales, integración continua en cada push, y
migraciones versionadas que nunca se editan hacia atrás.

**Una fase con el CI en rojo no está terminada.**

Y porque un análisis equivocado es peor que ninguno, hay cuatro capas de verificación: fixtures
de PGNs reales con respuesta congelada, validación cruzada contra la precisión de chess.com y
contra Lichess, diez invariantes de datos que corren todo el tiempo, y reconciliación de la
ingesta contra el conteo real de chess.com. Todo visible en la página `/salud`.

## Dónde corre todo

Nada corre en un computador tuyo. El código vive en GitHub, la app en Vercel, la base de datos
en Supabase, y Stockfish se instala solo dentro de la máquina temporal que GitHub presta para
cada análisis. Puedes trabajar desde el celular.

## El riesgo real

No es técnico. Es que construir la app resulte más entretenido que perder partidas de rápida un
sábado en la mañana. Una app de análisis sin partidas nuevas es un museo. Por eso el número
principal de la portada es "partidas de rápida este mes" y no la tasa de blunders.
