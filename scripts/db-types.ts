/**
 * Genera lib/database.types.ts.
 *
 * Dos caminos, mismo archivo de salida:
 *
 *   pnpm db:types --env dev|prod      -> CLI oficial de Supabase contra el proyecto remoto
 *                                        (usa SUPABASE_PROJECT_ID_DEV / _PROD). Es el camino
 *                                        normal y el que manda docs/ENGINEERING.md.
 *
 *   pnpm db:types --db-url <url>      -> introspeccion directa contra cualquier Postgres.
 *                                        Existe porque `supabase gen types --db-url` levanta
 *                                        un contenedor y no siempre hay Docker (por ejemplo,
 *                                        en una sesion de Claude Code en la nube). La salida
 *                                        tiene la misma forma que la del CLI.
 *
 * Regenerar y commitear despues de CADA migracion.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Client } from 'pg';

const OUT = 'lib/database.types.ts';

type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: 'YES' | 'NO';
  has_default: boolean;
  is_generated: boolean;
  kind: 'table' | 'view';
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function tsTypeOf(col: Column, enums: Map<string, string[]>): string {
  const udt = col.udt_name;
  if (enums.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  if (udt.startsWith('_')) return `${tsTypeOf({ ...col, udt_name: udt.slice(1) }, enums)}[]`;
  switch (udt) {
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Json';
    default:
      return 'string';
  }
}

function objectBody(
  cols: Column[],
  enums: Map<string, string[]>,
  mode: 'row' | 'insert' | 'update',
): string {
  return cols
    .map((c) => {
      const type = tsTypeOf(c, enums);
      const nullable = c.is_nullable === 'YES';
      const optional =
        mode === 'update' || (mode === 'insert' && (nullable || c.has_default || c.is_generated));
      return `          ${c.column_name}${optional ? '?' : ''}: ${type}${nullable ? ' | null' : ''}`;
    })
    .join('\n');
}

async function generateFromDbUrl(dbUrl: string): Promise<string> {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const enumRows = await client.query<{ name: string; labels: string[] }>(`
      select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type t
      join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname
      order by t.typname
    `);
    const enums = new Map(enumRows.rows.map((r) => [r.name, r.labels]));

    const colRows = await client.query<Column>(`
      select c.relname                                   as table_name,
             a.attname                                   as column_name,
             format_type(a.atttypid, a.atttypmod)        as data_type,
             t.typname                                   as udt_name,
             case when a.attnotnull then 'NO' else 'YES' end as is_nullable,
             (d.adbin is not null)                       as has_default,
             (a.attidentity <> '' or a.attgenerated <> '') as is_generated,
             case c.relkind when 'r' then 'table' else 'view' end as kind
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_type t on t.oid = a.atttypid
      left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
      where n.nspname = 'public' and c.relkind in ('r', 'v') and a.attnum > 0 and not a.attisdropped
      order by c.relkind, c.relname, a.attnum
    `);

    const funcRows = await client.query<{ name: string; args: string; returns: string }>(`
      select p.proname as name,
             pg_get_function_arguments(p.oid) as args,
             pg_get_function_result(p.oid) as returns
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
      order by p.proname
    `);

    const fkRows = await client.query<{
      table_name: string;
      constraint_name: string;
      columns: string[];
      referenced_table: string;
      referenced_columns: string[];
      is_one_to_one: boolean;
    }>(`
      select c.relname as table_name,
             con.conname as constraint_name,
             array_agg(att.attname::text order by u.ord) as columns,
             ref.relname as referenced_table,
             array_agg(refatt.attname::text order by u.ord) as referenced_columns,
             exists (
               select 1 from pg_index i
               where i.indrelid = con.conrelid and i.indisunique
                 and i.indkey::int2[] @> con.conkey
             ) as is_one_to_one
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace n on n.oid = c.relnamespace
      join lateral unnest(con.conkey) with ordinality as u(attnum, ord) on true
      join lateral unnest(con.confkey) with ordinality as r(attnum, ord) on r.ord = u.ord
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = u.attnum
      join pg_attribute refatt on refatt.attrelid = con.confrelid and refatt.attnum = r.attnum
      where con.contype = 'f' and n.nspname = 'public'
      group by c.relname, con.conname, ref.relname, con.conrelid, con.conkey
      order by c.relname, con.conname
    `);

    const relationshipsOf = (table: string): string => {
      const rows = fkRows.rows.filter((r) => r.table_name === table);
      if (rows.length === 0) return '        Relationships: []';
      const body = rows
        .map(
          (r) => `          {
            foreignKeyName: "${r.constraint_name}"
            columns: [${r.columns.map((c) => `"${c}"`).join(', ')}]
            isOneToOne: ${r.is_one_to_one}
            referencedRelation: "${r.referenced_table}"
            referencedColumns: [${r.referenced_columns.map((c) => `"${c}"`).join(', ')}]
          }`,
        )
        .join('\n');
      return `        Relationships: [\n${body}\n        ]`;
    };

    const byRel = new Map<string, Column[]>();
    for (const col of colRows.rows) {
      const list = byRel.get(col.table_name) ?? [];
      list.push(col);
      byRel.set(col.table_name, list);
    }

    const tables = [...byRel.entries()].filter(([, cols]) => cols[0]?.kind === 'table');
    const views = [...byRel.entries()].filter(([, cols]) => cols[0]?.kind === 'view');

    const tablesSrc = tables
      .map(
        ([name, cols]) => `      ${name}: {
        Row: {
${objectBody(cols, enums, 'row')}
        }
        Insert: {
${objectBody(cols, enums, 'insert')}
        }
        Update: {
${objectBody(cols, enums, 'update')}
        }
${relationshipsOf(name)}
      }`,
      )
      .join('\n');

    const viewsSrc = views
      .map(
        ([name, cols]) => `      ${name}: {
        Row: {
${objectBody(cols, enums, 'row')}
        }
        Relationships: []
      }`,
      )
      .join('\n');

    const enumsSrc = [...enums.entries()]
      .map(([name, labels]) => `      ${name}: ${labels.map((l) => `"${l}"`).join(' | ')}`)
      .join('\n');

    const functionsSrc = funcRows.rows
      .map((f) => {
        const args = f.args.trim() === '' ? 'Record<PropertyKey, never>' : '{ [key: string]: never }';
        const returns = f.returns === 'void' ? 'undefined' : 'unknown';
        return `      ${f.name}: {
        Args: ${args}
        Returns: ${returns}
      }`;
      })
      .join('\n');

    return `// Generado por \`pnpm db:types\`. NO editar a mano.
// Regenerar despues de cada migracion y commitear (docs/ENGINEERING.md seccion 6).

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
${tablesSrc}
    }
    Views: {
${viewsSrc}
    }
    Functions: {
${functionsSrc}
    }
    Enums: {
${enumsSrc}
    }
    CompositeTypes: Record<PropertyKey, never>
  }
}

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type Views<T extends keyof PublicSchema['Views']> = PublicSchema['Views'][T]['Row'];
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];
`;
  } finally {
    await client.end();
  }
}

function generateFromProject(projectId: string): string {
  const res = spawnSync(
    'pnpm',
    ['exec', 'supabase', 'gen', 'types', 'typescript', '--project-id', projectId, '--schema', 'public'],
    { encoding: 'utf8' },
  );
  if (res.status !== 0) {
    throw new Error(`supabase gen types fallo:\n${res.stderr}`);
  }
  return res.stdout;
}

async function main(): Promise<void> {
  const dbUrl = arg('--db-url') ?? process.env['SUPABASE_DB_URL_FOR_TYPES'];
  const envName = arg('--env');

  let out: string;
  if (envName) {
    const key = envName === 'prod' ? 'SUPABASE_PROJECT_ID_PROD' : 'SUPABASE_PROJECT_ID_DEV';
    const projectId = process.env[key];
    if (!projectId) throw new Error(`Falta ${key} en el ambiente para generar los tipos de ${envName}.`);
    out = generateFromProject(projectId);
  } else if (dbUrl) {
    out = await generateFromDbUrl(dbUrl);
  } else {
    throw new Error('Uso: pnpm db:types --env dev|prod   |   pnpm db:types --db-url <postgres-url>');
  }

  writeFileSync(OUT, out);
  console.log(`${OUT} regenerado.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
