# Ambientes

## La restricción que manda

El plan gratuito de Supabase permite **2 proyectos activos**. Eso significa **dos bases de
datos, no tres**. Un tercer ambiente dedicado exigiría el plan pagado.

Para un producto de un solo usuario, tres ambientes no se ganan el sueldo: dev y QA harían
exactamente lo mismo con los mismos datos y la misma persona probando. Lo que sí se gana el
sueldo, y es lo que se implementa, son **dos bases de datos y tres etapas de despliegue**.

Si algún día se necesitan más ambientes, la alternativa evaluada es Neon, que da ramas de base
de datos gratis y no tiene tope de dos proyectos. El razonamiento completo está en
`docs/DECISIONES-DE-STACK.md`.

## El esquema

| Etapa | Rama de Git | Despliegue en Vercel | Base de datos | Para qué |
|---|---|---|---|---|
| **Feature** | `feat/lo-que-sea` | Preview automático por cada PR | `chessito-dev` | Probar un cambio antes de mezclarlo |
| **Dev / QA** | `dev` | Preview fijo de la rama `dev` | `chessito-dev` | Integrar y validar antes de producción |
| **Producción** | `main` | Producción | `chessito-prod` | Lo que usas de verdad |

Vercel crea un despliegue de preview con URL propia por cada pull request, gratis y sin
configurar nada. Esa es la tercera etapa sin pagar una tercera base de datos.

## Flujo de trabajo

```
feat/xxx  ──PR──▶  dev  ──PR──▶  main
   │                │              │
   ▼                ▼              ▼
preview          preview       producción
   └──── chessito-dev ────┘    chessito-prod
```

1. Cada fase o cambio se trabaja en una rama `feat/`
2. Se abre un pull request contra `dev`. CI corre. Vercel publica una URL de preview
3. Se revisa en esa URL, con datos de dev
4. Se mezcla a `dev`
5. Cuando la fase está completa y validada, se abre un PR de `dev` a `main`
6. Al mezclar a `main`, Vercel despliega a producción

**Nunca se hace push directo a `main`.** Se protege la rama en GitHub: Settings, Branches,
Add branch protection rule, exigiendo pull request y que los checks de CI estén en verde.

## Las dos bases de datos

**`chessito-dev`**
- Se carga con un subconjunto: los últimos 3 meses de partidas. Suficiente para probar, rápido
  de recargar, y no gasta minutos de análisis
- Se puede borrar y recrear cuando sea. No hay nada valioso ahí
- Es donde se prueba una migración antes de que toque producción

**`chessito-prod`**
- Histórico completo y todas las evaluaciones del motor
- Solo recibe migraciones que ya pasaron por dev
- Es la que respalda el snapshot NDJSON a Storage

## Migraciones

Regla de oro: **una migración se aplica primero a dev, siempre.**

```
pnpm db:push --env dev     # aplica a chessito-dev
pnpm db:push --env prod    # aplica a chessito-prod, solo después de validar en dev
```

Nunca se edita una migración ya aplicada a producción. Si hay que corregir algo, es una
migración nueva.

Después de cada migración, `pnpm db:types` regenera los tipos y se commitean.

## Secretos, y dónde vive cada uno

| Secreto | Vercel producción | Vercel preview | GitHub Actions | `.env.local` |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | prod | dev | dev y prod | dev |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | prod | dev | dev y prod | dev |
| `SUPABASE_SERVICE_ROLE_KEY` | prod | dev | dev y prod | dev |
| `SUPABASE_DB_URL` | no aplica | no aplica | dev y prod | dev |
| `CHESSCOM_USERNAME` | igual | igual | igual | igual |
| `OWNER_EMAIL` | igual | igual | no aplica | igual |
| `CRON_SECRET` | distinto | distinto | no aplica | cualquiera |

Vercel permite definir variables por ambiente (Production, Preview, Development) en Settings,
Environment Variables. Ahí se separa prod de dev sin tocar código.

En GitHub Actions, los secretos de producción viven en un **environment** llamado `production`
con regla de aprobación manual, y los de dev en uno llamado `development`. Un workflow que va a
escribir en producción tiene que pedir tu aprobación antes de correr. Es un clic, y evita que
un análisis mal configurado escriba sobre el histórico bueno.

## Cómo saber en qué ambiente estás

La app muestra un distintivo permanente en la barra superior cuando **no** está en producción:
una etiqueta con el nombre del ambiente. Un preview que se ve idéntico a producción es la
receta para tomar decisiones sobre datos equivocados.

El mismo valor va a `job_runs.environment`, así que en la página de salud siempre se sabe qué
ambiente escribió cada corrida.

## Qué NO hacemos

- **Nada de un tercer proyecto de Supabase.** No cabe en el plan gratuito y no aporta.
- **Nada de datos sintéticos en dev.** Se usa un subconjunto de partidas reales. Los datos
  inventados esconden justo los casos raros que rompen el parser.
- **Nada de correr el analizador de Stockfish contra producción desde una rama que no sea
  `main`.** El workflow verifica la rama antes de tocar la base de producción.
