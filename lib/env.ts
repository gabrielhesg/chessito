import 'server-only';
import { z } from 'zod';

/**
 * El UNICO archivo del proyecto que lee `process.env`. Ver docs/ENGINEERING.md seccion 3.
 *
 * La validacion es perezosa a proposito: se dispara la primera vez que alguien lee una
 * variable, no al importar el modulo. Si fuera al importar, `next build` se caeria en CI,
 * donde no hay secretos de Supabase y no se ejecuta ninguna consulta. Los procesos batch
 * llaman a `assertEnv()` en su primera linea y asi conservan el "falla al inicio con el
 * nombre de la variable que falta" que exige el estandar.
 */

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CHESSCOM_USERNAME: z.string().min(1),
  OWNER_EMAIL: z.email(),
  CRON_SECRET: z.string().min(1),
});

const optionalSchema = z.object({
  /** Solo la usan los scripts batch y la generacion de tipos. La app no la necesita. */
  SUPABASE_DB_URL: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema> & z.infer<typeof optionalSchema>;

/** 'prod' | 'dev'. Es lo que va a `job_runs.environment` y a la etiqueta visible. */
export type AppEnv = 'prod' | 'dev';

let cached: Env | null = null;

function readEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  const parsedOptional = optionalSchema.safeParse(process.env);

  if (!parsed.success || !parsedOptional.success) {
    const issues = [
      ...(parsed.success ? [] : parsed.error.issues),
      ...(parsedOptional.success ? [] : parsedOptional.error.issues),
    ]
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ');
    throw new Error(`Variables de entorno invalidas o ausentes:\n  ${issues}`);
  }

  cached = { ...parsed.data, ...parsedOptional.data };
  return cached;
}

/**
 * Objeto tipado de variables de entorno. Cada lectura valida (una sola vez) y falla con el
 * nombre exacto de lo que falta.
 */
export const env: Env = new Proxy({} as Env, {
  get(_target, prop: string) {
    return readEnv()[prop as keyof Env];
  },
  has(_target, prop: string) {
    return prop in readEnv();
  },
  ownKeys() {
    return Reflect.ownKeys(readEnv());
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    return { value: readEnv()[prop as keyof Env], enumerable: true, configurable: true };
  },
});

/** Falla al arrancar si falta algo. Primera linea de todo script batch. */
export function assertEnv(): Env {
  return readEnv();
}

/**
 * Ambiente en el que corre este proceso. Las variables que lee esta funcion (`VERCEL_ENV`,
 * `APP_ENV`, `VERCEL_GIT_COMMIT_REF`) quedan fuera del esquema Zod a proposito: son opcionales
 * y las inyecta la plataforma, no el operador. `APP_ENV` si se valida aca abajo.
 *
 * En Vercel se deriva de `VERCEL_ENV` (production -> prod; preview y development -> dev, que es
 * la base `chessito-dev`). Fuera de Vercel manda `APP_ENV`. Ver docs/ENVIRONMENTS.md.
 */
export function appEnv(): AppEnv {
  const vercel = process.env['VERCEL_ENV'];
  if (vercel === 'production') return 'prod';
  if (vercel === 'preview' || vercel === 'development') return 'dev';

  const declared = process.env['APP_ENV'];
  if (declared === undefined || declared === '') return 'dev';
  if (declared !== 'prod' && declared !== 'dev') {
    // Un APP_ENV mal escrito degradaria a 'dev' en silencio y escribiria eso en
    // job_runs.environment, que es justo el campo con el que despues se audita quien escribio
    // que. Mejor caerse aca.
    throw new Error(`APP_ENV invalido: "${declared}". Solo 'prod' o 'dev'.`);
  }
  return declared;
}

/** Etiqueta visible en la barra superior cuando NO es produccion. */
export function envLabel(): string | null {
  if (appEnv() === 'prod') return null;
  const vercel = process.env['VERCEL_ENV'];
  if (vercel === 'preview') {
    const branch = process.env['VERCEL_GIT_COMMIT_REF'];
    return branch ? `preview · ${branch}` : 'preview';
  }
  return 'dev';
}
