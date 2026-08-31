# Estándares de ingeniería

Este proyecto se construye como un producto, no como un script personal. Estas reglas son
obligatorias y son criterio de aceptación de cada fase: una fase no se da por terminada si el
código funciona pero no cumple esto.

---

## 1. Tipado

- TypeScript en modo **strict**. `strict: true`, `noUncheckedIndexedAccess: true`,
  `noImplicitOverride: true` en `tsconfig.json`.
- **Cero `any`.** Si hace falta un escape, es `unknown` con validación explícita.
- Los tipos de la base de datos se **generan**, no se escriben a mano:
  `supabase gen types typescript --project-id <id> > lib/database.types.ts`, expuesto como
  `pnpm db:types`. Se regenera cada vez que cambia una migración.
- Toda respuesta de API externa (chess.com) se valida con **Zod** en el borde del sistema.
  Nada entra al dominio sin haber sido parseado. Un cambio de contrato de chess.com tiene que
  fallar con un mensaje claro, no corromper la base en silencio.

## 2. Estructura del código

```
app/                  rutas de Next.js (Server Components por defecto)
components/           componentes de UI, sin lógica de negocio
lib/
  chess/              parseo de PGN, resolución de aperturas, cálculo de reloj
  engine/             cliente UCI de Stockfish
  analysis/           clasificación de jugadas, métricas derivadas
  supabase/           clientes (admin con 'server-only', y el de servidor con sesión)
  env.ts              validación de variables de entorno con Zod, al arrancar
scripts/              procesos batch (ingesta, extracción, análisis, puzzles)
supabase/migrations/  SQL versionado
tests/                unitarios y de integración
```

Regla de dependencias: `app/` puede importar de `lib/`, `lib/` nunca importa de `app/`. La
lógica de ajedrez en `lib/chess/` y `lib/analysis/` es **pura y testeable sin base de datos**.
Si para probar el cálculo de tiempo por jugada hace falta levantar Postgres, está mal diseñado.

## 3. Variables de entorno

Un único archivo `lib/env.ts` que valida todo con Zod al arrancar y exporta un objeto tipado.
Ningún otro archivo lee `process.env` directamente. Si falta una variable, el proceso falla al
inicio con el nombre de la variable, no a mitad de una corrida de tres horas.

`SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_DB_URL` solo existen en el objeto de servidor, y
`lib/supabase/admin.ts` empieza con `import 'server-only'`.

## 4. Tests

**Vitest.** No es opcional. Lo que se testea sí o sí:

| Qué | Por qué |
|---|---|
| Cálculo de `move_time_ms` con incremento, plies 1 y 2, y truncamiento a decisegundos | Es la trampa 1 y se equivoca en silencio |
| Los dos pasos de signo de la evaluación, con un caso de negras y uno de blancas | Es la trampa 2 y es la que invierte todo el análisis |
| Clasificación por caída de win% en los cuatro umbrales | Define el producto entero |
| Resolución de apertura por EPD, incluida una transposición | Es código nuevo sin librería que lo respalde |
| Parseo de un PGN real de chess.com, con `%clk` y con partida por correspondencia | Es el borde con el mundo exterior |
| `win_pct` y `wilson_lower` contra valores de referencia | Son las funciones de las que cuelgan todas las vistas |

Los tests usan **fixtures reales**: PGNs de verdad guardados en `tests/fixtures/`, no strings
inventados. Un PGN inventado no reproduce los casos raros que rompen el parser.

Cobertura mínima exigida en `lib/chess/`, `lib/analysis/` y `lib/engine/`: **80%**. En `app/` no
se exige cobertura.

## 5. Integración continua

`.github/workflows/ci.yml`, que corre en cada push y en cada pull request:

1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (ESLint con la config de Next, más `@typescript-eslint`)
3. `pnpm typecheck` (`tsc --noEmit`)
4. `pnpm test` (Vitest, con cobertura)
5. `pnpm build`

**Si CI falla, la fase no está terminada.** No se avanza a la siguiente con el CI en rojo.

## 6. Migraciones

- Todo cambio de esquema es un archivo nuevo en `supabase/migrations/`, numerado y con nombre
  descriptivo. **Nunca se edita una migración ya aplicada.**
- Cada migración es idempotente en lo que se pueda (`create index if not exists`) y reversible
  en su intención (queda documentado en un comentario cómo se revierte).
- Después de cada migración se regeneran los tipos con `pnpm db:types` y se commitean.

## 7. Manejo de errores

- **Nada de `catch {}` vacío.** Todo catch registra o propaga.
- Los procesos batch (ingesta, extracción, análisis) son **resistentes a fallas parciales**: una
  partida que falla marca su estado como `failed`, se registra con su id y su motivo, y la
  corrida continúa. Nunca una partida mala mata un backfill de tres horas.
- Los procesos batch son **reanudables**: cortar y volver a lanzar continúa donde iba. Esto ya
  está diseñado en la máquina de estados de `analysis_state`.
- Errores de red contra chess.com: reintento con backoff exponencial, máximo 3 intentos, y
  respeto explícito del `429`.

## 8. Observabilidad

Cada script batch termina imprimiendo un resumen estructurado: cuántas partidas procesó,
cuántas falló, cuántas quedan pendientes, y cuánto demoró. Sin eso no hay forma de saber si un
backfill de tres horas hizo su trabajo o si se quedó dando vueltas.

Logging con nivel (`info`, `warn`, `error`) y salida en JSON en CI, para que los logs de GitHub
Actions se puedan leer.

## 9. Seguridad

- RLS habilitado en todas las tablas, sin políticas, y acceso solo del lado servidor.
- La service role key nunca cruza al cliente. `import 'server-only'` es la garantía de que el
  build falla si alguien lo intenta.
- El endpoint de ingesta valida `CRON_SECRET` antes de hacer nada.
- Los secretos de GitHub Actions se leen de `secrets`, nunca se imprimen en los logs.
- `.env.local`, `.cache/` y cualquier PGN descargado van en `.gitignore`.

## 10. Rendimiento

- Toda página tiene que responder bajo **300 ms** con el histórico completo cargado. Si una
  vista se pasa, se revisa el plan de ejecución con `explain analyze` antes de agregar un índice
  a ciegas.
- Nada de N+1 contra Postgres. Una página, una consulta por bloque de datos.
- Las agregaciones entre filas viven en vistas SQL. TypeScript no agrega, solo presenta.

## 11. Git

- Una rama por fase, un pull request por fase, merge cuando CI está verde.
- Commits en imperativo y en español, describiendo el qué y el porqué.
- Nunca se commitea código comentado ni `console.log` de depuración.

## 12. Definición de terminado

Una fase está terminada cuando, y solo cuando:

1. Cumple los criterios de aceptación específicos de esa fase
2. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` pasan en verde
3. La cobertura de los módulos de lógica está sobre 80%
4. Está desplegada y funcionando donde corresponda
5. `CLAUDE.md` está actualizado con lo que la siguiente sesión necesita saber
