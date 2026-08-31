# Despliegue paso a paso

Todo lo que hay que hacer a mano, en orden, con la pantalla exacta y el nombre exacto de cada
variable. Nada de esto lo puede hacer Claude Code por ti: son claves tuyas y clics en paneles.

Las claves **no tienen que pasar por el chat**. Las escribes tu directamente en cada panel.

---

## 1. Supabase · crear los dos proyectos

En **supabase.com**, entrando con GitHub:

1. **New project** → nombre `chessito-dev`. Genera y guarda la contraseña de la base de datos.
   Region: la mas cercana a Chile.
2. Repite con **New project** → nombre `chessito-prod`, con su propia contraseña.

Son los dos que permite el plan gratuito. No intentes un tercero.

## 2. Supabase · aplicar las migraciones (dev primero, siempre)

En el proyecto **chessito-dev**, menu izquierdo → **SQL Editor** → **New query**. Pega y ejecuta
los tres archivos, **en este orden**, uno por vez:

1. `supabase/migrations/0001_init.sql`
2. `supabase/migrations/0002_observability.sql`
3. `supabase/migrations/0003_session_features.sql`

Comprueba que quedo bien con esta consulta, que tiene que devolver diez filas en verde:

```sql
select check_name, ok from v_data_quality;
```

Cuando la app funcione en dev, repite exactamente lo mismo en **chessito-prod**.

> Alternativa: `pnpm db:push --env dev` hace lo mismo desde la terminal si tienes
> `SUPABASE_DB_URL_DEV` en `.env.local`. Lleva la cuenta en la tabla `schema_migrations`.

## 3. Supabase · desactivar los signups y crear tu usuario

**Esto es lo que la app necesita para dejarte entrar.** En cada proyecto:

1. **Authentication** → **Sign In / Providers** → **Email**: deja **Enable email provider**
   encendido y **apaga** *Allow new users to sign up*.
2. **Authentication** → **Users** → **Add user** → **Create new user**:
   email `gabrielhesg@gmail.com` (el mismo que vas a poner en `OWNER_EMAIL`).

**Sin este paso nadie puede entrar**: con signups deshabilitados, `signInWithOtp` falla para un
email que no existe todavia.

## 4. Donde esta cada clave en Supabase

En cada proyecto, **Project Settings**:

| Clave | Pantalla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → **API** → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → **API** → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → **API** → `service_role` (**secreta**) |
| `SUPABASE_DB_URL` | Settings → **Database** → Connection string → URI (reemplaza `[YOUR-PASSWORD]`) |
| id del proyecto | Settings → **General** → Reference ID |

**La `service_role` nunca lleva prefijo `NEXT_PUBLIC_`.** El build falla a proposito si alguien
la importa desde un componente cliente.

## 5. Vercel · conectar el repositorio

1. **vercel.com** → **Add New** → **Project** → importa `gabrielhesg/chessito`.
2. Framework: Next.js (lo detecta solo). No cambies nada del build.
3. **No despliegues todavia**: primero carga las variables (paso 6).

## 6. Vercel · variables de entorno, separadas por ambiente

**Project → Settings → Environment Variables.** Cada variable se agrega dos veces, una marcando
solo **Production** y otra marcando **Preview** y **Development**:

| Variable | Production (marca solo Production) | Preview + Development |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | la de **chessito-prod** | la de **chessito-dev** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon de **prod** | anon de **dev** |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role de **prod** | service_role de **dev** |
| `CHESSCOM_USERNAME` | `gabrielhesg` | `gabrielhesg` |
| `OWNER_EMAIL` | `gabrielhesg@gmail.com` | `gabrielhesg@gmail.com` |
| `CRON_SECRET` | una cadena larga al azar | **otra distinta** |

`SUPABASE_DB_URL` **no va en Vercel**: alli la app habla por PostgREST con la service role key.
Solo la necesitan los scripts batch y GitHub Actions.

Para generar un `CRON_SECRET`: `openssl rand -hex 32`.

Con el cron de Vercel no hay que hacer nada mas: Vercel manda el `Authorization: Bearer` con el
valor de `CRON_SECRET` automaticamente. El horario esta en `vercel.json` (09:00 UTC, todos los
dias).

## 7. Supabase · autorizar la URL de Vercel para el login

En **chessito-prod** → **Authentication** → **URL Configuration**:

- **Site URL**: la URL de produccion de Vercel (`https://chessito-....vercel.app`)
- **Redirect URLs**: agrega `https://chessito-....vercel.app/**`

En **chessito-dev** agrega ademas `http://localhost:3000/**` y la URL de preview.

## 8. GitHub · secretos para los workflows

**Settings → Environments** del repositorio. Crea dos environments:

**`development`** (sin aprobacion) y **`production`** (marca *Required reviewers* y agregate a ti
mismo: un workflow que va a escribir en produccion pide tu clic antes de correr).

En cada uno, **Environment secrets**:

| Secreto | En `development` | En `production` |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | dev | prod |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | dev | prod |
| `SUPABASE_SERVICE_ROLE_KEY` | dev | prod |
| `SUPABASE_DB_URL` | dev | prod |
| `CHESSCOM_USERNAME` | `gabrielhesg` | `gabrielhesg` |
| `OWNER_EMAIL` | tu email | tu email |

Opcional, en **Settings → Secrets and variables → Actions → Repository secrets**:
`SUPABASE_DB_URL` apuntando a **dev**, para que el job `calidad-de-datos` del CI corra los diez
chequeos en cada push. Sin ese secreto el job se salta con un aviso, no se pone rojo.

## 9. GitHub · proteger `main`

**Settings → Branches → Add branch protection rule** (o *Rulesets*):

- Branch name pattern: `main`
- Marca **Require a pull request before merging**
- Marca **Require status checks to pass before merging**, y elige `verificar` e `integracion`
- Marca **Do not allow bypassing the above settings**

Crea tambien la rama `dev` (`git checkout -b dev && git push -u origin dev`). El flujo es
`feat/* → dev → main`, y `main` despliega a produccion.

## 10. Primera carga de datos

Con las migraciones aplicadas en dev:

```bash
cp .env.example .env.local     # y completa las claves de chessito-dev
pnpm install
pnpm openings:load             # ~3.800 aperturas de Lichess
pnpm ingest --full             # todo el historico de chess.com
```

`pnpm ingest --full` con ~9.700 partidas demora unos dos minutos y es idempotente: correrlo dos
veces no cambia nada.

Sin terminal a mano: entra a **Actions → ingest → Run workflow**, elige `full` y el ambiente
sale de la rama.

Para produccion, lo mismo con `.env.local` apuntando a `chessito-prod`, o disparando el workflow
desde `main`.

## 11. Comprobar que quedo bien

1. Abre la URL de produccion: tiene que pedirte el email y mandarte un codigo.
2. Entra y mira `/salud`:
   - la ultima ingesta con exito, en verde (rojo si pasaron mas de 48 horas)
   - los diez chequeos de calidad en verde
   - las ultimas corridas con sus conteos
3. En `/aperturas`, revisa el porcentaje de "Sin resolver": tiene que ser bajo (en el historico
   real es 0,01%). Si crece, hay un bug en el cargador de aperturas.
4. Aprieta **Actualizar ahora** en la portada y vuelve a `/salud`: tiene que aparecer una corrida
   nueva con disparador `manual`.
