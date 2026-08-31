# Fase 1 · La app en el aire

Lee @CLAUDE.md, @PLAN.md, @docs/ENGINEERING.md, @docs/ENVIRONMENTS.md, @docs/CONFIANZA.md,
@docs/DECISIONES-DE-STACK.md, @docs/DATA-SOURCES.md, @supabase/migrations/0001_init.sql y
@supabase/migrations/0002_observability.sql antes de escribir una línea de código.

Vamos a construir la Fase 1 de este proyecto: la aplicación web desplegada y funcionando.
Trátalo como un desarrollo profesional, no como un script personal. docs/ENGINEERING.md es
criterio de aceptación, no una sugerencia.

PRIMERO: entra en plan mode, léelo todo, y muéstrame el plan de archivos y el orden de trabajo
antes de escribir nada. Si algo del spec es ambiguo o crees que está mal, dímelo ahora, no lo
resuelvas por tu cuenta.

Si en el repositorio hay restos de un sondeo anterior (un scripts/probe.ts o similar),
consérvalo pero muévelo a scripts/legacy/ y no lo integres.

=== ALCANCE ===

1. FUNDACIONES
   - Next.js App Router, TypeScript en modo strict (strict, noUncheckedIndexedAccess,
     noImplicitOverride), Tailwind, pnpm. Versiones exactas en package.json, sin rangos.
   - lib/env.ts que valide TODAS las variables de entorno con Zod al arrancar y exporte un
     objeto tipado. Ningún otro archivo lee process.env directamente.
   - lib/supabase/admin.ts con el cliente de service role, primera línea import 'server-only'.
     Nunca NEXT_PUBLIC_ para esa key.
   - Estructura de carpetas según docs/ENGINEERING.md. lib/ nunca importa de app/.

2. AMBIENTES, según docs/ENVIRONMENTS.md
   - Dos proyectos de Supabase: chessito-dev y chessito-prod. Son los 2 que permite el plan
     gratuito, no intentes un tercero.
   - Ramas: feat/* para el trabajo, dev para integración, main para producción. Protege main
     exigiendo pull request y CI en verde. Nunca push directo a main.
   - Variables de entorno separadas por ambiente en Vercel (Production y Preview).
   - La app muestra una etiqueta visible con el nombre del ambiente cuando NO es producción.
   - Guíame paso a paso cuando necesites que yo configure algo en las webs de Supabase, Vercel
     o GitHub. Dime exactamente qué pantalla abrir y qué apretar.

3. BASE DE DATOS
   - Supabase CLI configurado. "pnpm db:push" con selector de ambiente: primero dev, y a prod
     solo después de validar. Aplica las migraciones 0001 y 0002.
   - "pnpm db:types" que genera lib/database.types.ts. Commitea los tipos generados.
   - Todo el acceso a datos usa esos tipos. Cero any.
   - NUNCA edites 0001_init.sql ni 0002_observability.sql. Si falta algo, migración nueva.

4. CALIDAD Y CONFIANZA, desde el primer commit y no al final
   - Vitest configurado con cobertura.
   - tests/fixtures/ con PGNs REALES de mi cuenta, no inventados, cubriendo como mínimo los
     casos que lista docs/CONFIANZA.md capa 1: una partida 15+10 con %clk, una 10+0 sin
     incremento, una de correspondencia sin %clk, y una ganada por tiempo. Bájalos con el
     cliente de chess.com y guárdalos con su archivo .expected.json al lado.
   - .github/workflows/ci.yml que corre en cada push: install con frozen-lockfile, lint,
     typecheck, test con cobertura, y build. Si CI está rojo, la fase no está terminada.
   - ESLint con la config de Next más @typescript-eslint.
   - .gitignore con .env.local, .cache/ y coverage/. Los PGNs de tests/fixtures/ SÍ se
     commitean, son parte de la suite.
   - La CI falla si algún chequeo de la vista v_data_quality da false.

5. APERTURAS
   - "pnpm openings:load" (scripts/load-openings.ts): baja los TSV a.tsv..e.tsv de
     lichess-org/chess-openings, reproduce cada línea con chess.js, y guarda como epd los
     PRIMEROS CUATRO CAMPOS de fen(), porque chess.js no expone epd(). El id es un slug
     determinista eco + '_' + slug(name) desde una única función exportada y testeada.
     Inserta ordenando por ply_count ascendente con on conflict (epd) do nothing.
   - Test: la resolución por EPD acierta en una línea normal y en una transposición.

6. INGESTA
   - lib/chess/chesscom.ts: cliente de la API pública, con schemas Zod para la respuesta.
     Fetch SERIAL, nunca Promise.all. Reintento con backoff exponencial, máximo 3 intentos, y
     respeto explícito del 429.
   - scripts/ingest.ts expuesto como "pnpm ingest", y app/api/ingest/route.ts que exporta GET
     (el cron de Vercel dispara con GET) reutilizando la misma función.
   - Debe: upsert por chesscom_uuid; guardar accuracies en games.my_accuracy cuando venga;
     parsear time_control tolerando el formato 1/86400 de correspondencia; marcar
     analysis_state 'skipped' en correspondencia y en lo que no sea rules 'chess'; guardar en
     games.termination el resultado de GABRIEL y no el del rival; resolver la apertura por EPD
     con el match más profundo; guardar aparte el código del header [ECO] en opening_eco_cc y
     la URL del campo eco del JSON en opening_url_cc; recalcular session_id, game_in_session y
     prev_result con las window functions de docs/DATA-SOURCES.md.
   - Protegida con CRON_SECRET verificando el header Authorization.
   - Resistente a fallas parciales: una partida que falla se registra con su id y su motivo y
     la corrida continúa.
   - OBSERVABILIDAD OBLIGATORIA: cada corrida abre una fila en job_runs con status 'running' y
     la cierra con 'success' o 'failed', registrando procesadas, fallidas, saltadas, duración,
     ambiente y disparador.
   - RECONCILIACIÓN OBLIGATORIA, es la respuesta a "cómo sé que se cargaron bien": la ingesta
     le pregunta a chess.com cuántas partidas tiene cada mes que sincronizó, lo compara contra
     el conteo local de v_games_by_month, y guarda la diferencia en job_runs.detail. Si no
     calzan, la corrida se marca como failed. Ver docs/CONFIANZA.md capa 4.
   - CUATRO FORMAS DE DISPARARLA, todas llamando a la MISMA función, sin duplicar lógica.
     Ver docs/DECISIONES-DE-STACK.md para el razonamiento:
     a) .github/workflows/ingest.yml, programado CADA 3 HORAS, que es el camino principal.
        GitHub Actions permite hasta cada 5 minutos; Vercel solo uno al día.
     b) cron diario de Vercel (vercel.json), como piso garantizado. GitHub desactiva los
        workflows programados tras 60 días sin actividad en el repo, y el cron de Vercel no.
        Además es el que evita que Supabase se pause por inactividad.
     c) botón "Actualizar ahora" en la app, CRÍTICO: yo la uso justo después de jugar y no
        quiero esperar al próximo ciclo para ver la sesión de recién.
     d) "pnpm ingest" desde la terminal
   - Correr la ingesta dos veces seguidas no debe cambiar nada. Es idempotente por
     chesscom_uuid, y por eso puede estar duplicada en dos programadores sin riesgo.

7. AUTENTICACIÓN
   - Supabase Auth con OTP por email, signups deshabilitados, middleware que verifique que el
     email es igual a OWNER_EMAIL.
   - El middleware DEBE excluir /api/ingest, o el cron se queda afuera.
   - Al terminar, recuérdame que tengo que crear mi usuario a mano en el dashboard de Supabase,
     porque con signups deshabilitados nadie puede entrar.

8. INTERFAZ
   - /           portada. El número principal es "partidas de rápida este mes" contra una meta
                 de 30, leyendo v_monthly_activity. No es la tasa de blunders y no debe serlo.
   - /aperturas  lee v_opening_performance. Muestra el grupo "Sin resolver": si crece, hay un
                 bug en el loader de aperturas.
   - /ritmo      lee v_by_hour, v_by_session_index y v_after_result.
   - /registro   listado de partidas con filtros por time_class, color y resultado.
   - /salud      la página que me deja confiar en el sistema sin abrir la consola. Muestra:
                 cuándo fue la última ingesta exitosa con AVISO ROJO si pasaron más de 48
                 horas; los diez chequeos de v_data_quality en verde o rojo con su descripción;
                 las últimas corridas de job_runs con conteos y duración; las partidas por mes
                 de v_games_by_month; y cuántas quedan pendientes de analizar.
   - Diseño sobrio y legible, con estados de carga y estados vacíos reales. Nada de datos de
     ejemplo hardcodeados.

9. DESPLIEGUE
   - Conectar el repositorio a Vercel, configurar las variables de entorno de producción, y
     dejar el despliegue automático desde la rama principal.

=== REGLAS DURAS ===

- Todo acceso a datos del lado servidor, en Server Components o route handlers. Nada de
  useEffect para traer datos.
- Ninguna vista se consulta sin mostrar su n. Los cortes con n menor a 20 se muestran atenuados
  y sin recomendación asociada.
- Los rendimientos usan wilson_lower, que ya existe como función SQL, no el porcentaje pelado.
- Las agregaciones entre filas van en vistas SQL. Si falta una métrica, agrega una migración
  nueva. Nunca edites 0001_init.sql, ya está aplicada.
- Cero any. Cero catch vacíos. Cero console.log de depuración en el commit final.

=== ANTES DE DARLA POR TERMINADA ===

Usa un subagente para revisar críticamente lo que escribiste contra @docs/ENGINEERING.md y
@docs/CONFIANZA.md, y muéstrame qué encontró antes de cerrar.

=== TERMINADO CUANDO ===

1. La URL de producción abre, pide mi email, y muestra mi histórico completo de chess.com
2. Existe también el ambiente dev, con su propia base de datos y su etiqueta visible
3. CI en verde: lint, typecheck, test y build
4. Cobertura sobre 80% en lib/chess/
5. Los diez chequeos de /salud en verde
6. La reconciliación de la ingesta calza contra chess.com en los últimos tres meses
7. Las páginas responden bajo 300 ms con el histórico cargado
8. CLAUDE.md actualizado con lo que la siguiente sesión necesita saber

Cuando termines, dame las dos URLs, el resultado de la reconciliación y el resumen de lo que
quedó construido.
