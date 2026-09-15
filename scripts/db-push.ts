/**
 * `pnpm db:push --env dev|prod`
 *
 * Aplica las migraciones de `supabase/migrations/` en orden contra la base del ambiente,
 * llevando la cuenta de lo aplicado en la tabla `schema_migrations`. Primero dev, siempre
 * (docs/ENVIRONMENTS.md).
 *
 * Dos modos mas, para una base cuyo esquema se creo a mano (pegando el SQL en el editor de
 * Supabase) y por lo tanto NO tiene nada anotado en `schema_migrations`. Contra esa base, un
 * `db:push` normal intenta aplicar 0001 de nuevo y muere con "type game_result already exists":
 *
 *   --revisar
 *       Solo mira. No escribe nada. Imprime lo anotado en `schema_migrations`, las tablas y
 *       vistas que existen, y las columnas de `puzzles` y `puzzle_attempts`. Es lo que hay que
 *       correr ANTES de decidir, porque sin eso no se sabe hasta que migracion llego la base.
 *
 *   --marcar-aplicadas 0001_init.sql,0002_...
 *       Anota esas migraciones como aplicadas SIN ejecutarlas. Es para adoptar un esquema que
 *       ya existe. Solo se usa con la lista que salio de `--revisar`: marcar de mas deja la base
 *       sin objetos que el codigo espera, y el error aparece despues, en una pagina.
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

/** Lista de archivos de migracion, en el orden en que se aplican. */
function archivos(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Modo `--revisar`: mira y no toca. Todo lo que imprime es estructura, nunca datos. */
async function revisar(client: Client): Promise<void> {
  const anotadas = await client.query<{ version: string; applied_at: string }>(
    `select version, applied_at from schema_migrations order by version`,
  ).catch(() => ({ rows: [] as Array<{ version: string; applied_at: string }> }));

  const tablas = await client.query<{ table_name: string; table_type: string }>(
    `select table_name, table_type from information_schema.tables
      where table_schema = 'public' order by table_type, table_name`,
  );

  const columnas = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('puzzles', 'puzzle_attempts')
      order by table_name, ordinal_position`,
  );

  const porTipo = (tipo: string): string[] =>
    tablas.rows.filter((r) => r.table_type === tipo).map((r) => r.table_name);

  console.log('--- anotado en schema_migrations ---');
  if (anotadas.rows.length === 0) console.log('  (nada: la tabla esta vacia o no existe)');
  for (const r of anotadas.rows) console.log(`  ${r.version}  ${r.applied_at}`);

  console.log('--- archivos de migracion en el repo ---');
  for (const f of archivos()) {
    const marca = anotadas.rows.some((r) => r.version === f) ? 'anotada  ' : 'SIN anotar';
    console.log(`  ${marca} ${f}`);
  }

  console.log('--- tablas ---');
  console.log(`  ${porTipo('BASE TABLE').join(', ') || '(ninguna)'}`);
  console.log('--- vistas ---');
  console.log(`  ${porTipo('VIEW').join(', ') || '(ninguna)'}`);

  console.log('--- columnas de puzzles / puzzle_attempts ---');
  for (const tabla of ['puzzles', 'puzzle_attempts']) {
    const cols = columnas.rows.filter((r) => r.table_name === tabla).map((r) => r.column_name);
    console.log(`  ${tabla}: ${cols.join(', ') || '(la tabla no existe)'}`);
  }
}

/** Modo `--marcar-aplicadas`: anota sin ejecutar. Adopta un esquema que ya existe. */
async function marcarAplicadas(client: Client, lista: string): Promise<void> {
  const pedidas = lista
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const conocidas = new Set(archivos());

  const desconocidas = pedidas.filter((f) => !conocidas.has(f));
  if (desconocidas.length > 0) {
    throw new Error(
      `Estas no son migraciones de este repo: ${desconocidas.join(', ')}. ` +
        `Las que hay son: ${[...conocidas].join(', ')}`,
    );
  }

  for (const file of pedidas) {
    await client.query(
      'insert into schema_migrations (version) values ($1) on conflict (version) do nothing',
      [file],
    );
    console.log(`marcada como aplicada (sin ejecutar) ${file}`);
  }
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

    if (process.argv.includes('--revisar')) {
      console.log(`ambiente: ${envName}`);
      await revisar(client);
      return;
    }

    const marcar = arg('--marcar-aplicadas');
    if (marcar) {
      await marcarAplicadas(client, marcar);
      return;
    }

    const applied = new Set(
      (await client.query<{ version: string }>('select version from schema_migrations')).rows.map(
        (r) => r.version,
      ),
    );

    const files = archivos();

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
        const detalle = error instanceof Error ? error.message : String(error);
        // "ya existe" casi nunca es un bug de la migracion: es una base cuyo esquema se creo a
        // mano (pegando el SQL en el editor de Supabase) y por lo tanto con `schema_migrations`
        // vacia. Sin esta pista el mensaje no dice que hacer, y eso ya costo tres corridas.
        const pareceEsquemaAdoptado = /already exists|ya existe/i.test(detalle);
        throw new Error(
          `La migracion ${file} fallo y se revirtio: ${detalle}` +
            (pareceEsquemaAdoptado
              ? `\n\nEso suele significar que la base YA tiene el esquema pero schema_migrations` +
                ` esta vacia, porque se creo a mano. No hay que editar la migracion: hay que` +
                ` adoptar lo que ya esta.\n` +
                `  1. Corre --revisar para ver que objetos existen.\n` +
                `  2. Corre --marcar-aplicadas con SOLO las migraciones que crean objetos que ya` +
                ` viste (marcar de mas deja la base sin cosas que el codigo espera).\n` +
                `  3. Vuelve a correr sin banderas para aplicar el resto.\n` +
                `Desde el navegador es el workflow "migraciones" en modo "adoptar".`
              : ''),
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
