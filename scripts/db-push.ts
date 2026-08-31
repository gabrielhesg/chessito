/**
 * `pnpm db:push --env dev|prod`
 *
 * Aplica las migraciones de `supabase/migrations/` en orden contra la base del ambiente,
 * llevando la cuenta de lo aplicado en la tabla `schema_migrations`. Primero dev, siempre
 * (docs/ENVIRONMENTS.md).
 *
 * Lee la cadena de conexion de `SUPABASE_DB_URL_DEV` / `SUPABASE_DB_URL_PROD`, o de
 * `SUPABASE_DB_URL` si solo hay una configurada. Tambien acepta `--db-url <url>`.
 *
 * Si prefieres pegar el SQL a mano en el editor de Supabase, tambien vale: este script hace
 * exactamente lo mismo y en el mismo orden.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local', quiet: true });

const DIR = join(process.cwd(), 'supabase/migrations');

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function connectionString(): { url: string; envName: string } {
  const explicit = arg('--db-url');
  if (explicit) return { url: explicit, envName: 'explicito' };

  const envName = arg('--env');
  if (!envName) {
    throw new Error('Uso: pnpm db:push --env dev|prod   |   pnpm db:push --db-url <postgres-url>');
  }
  if (envName !== 'dev' && envName !== 'prod') {
    throw new Error(`Ambiente desconocido: "${envName}". Solo dev o prod.`);
  }
  const specific = process.env[envName === 'prod' ? 'SUPABASE_DB_URL_PROD' : 'SUPABASE_DB_URL_DEV'];
  const fallback = process.env['SUPABASE_DB_URL'];
  const url = specific ?? fallback;
  if (!url) {
    throw new Error(
      `Falta SUPABASE_DB_URL_${envName.toUpperCase()} (o SUPABASE_DB_URL) para aplicar a ${envName}.`,
    );
  }
  return { url, envName };
}

async function main(): Promise<void> {
  const { url, envName } = connectionString();
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query(`
      create table if not exists schema_migrations (
        version     text primary key,
        applied_at  timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await client.query<{ version: string }>('select version from schema_migrations')).rows.map(
        (r) => r.version,
      ),
    );

    const files = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(DIR, file), 'utf8');
      // Una migracion, una transaccion: si falla a la mitad no deja el esquema partido.
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (version) values ($1)', [file]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw new Error(
          `La migracion ${file} fallo y se revirtio: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      console.log(`aplicada ${file}`);
      count += 1;
    }

    console.log(
      JSON.stringify({ ambiente: envName, aplicadas: count, ya_estaban: applied.size, total: files.length }),
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
