/**
 * Respaldo NDJSON comprimido de `moves` (columnas del motor) y `puzzle_attempts` a Supabase
 * Storage, partido en trozos y con rotacion. Por que las dos cosas: ver `lib/backup/ndjson.ts`.
 * Son los unicos datos del sistema que no se pueden reconstruir desde chess.com: el PGN es la
 * fuente de verdad y se puede volver a analizar, pero las evaluaciones de Stockfish y el
 * historial de intentos del entrenador cuestan tiempo de motor y no.
 *
 * Corre como el ultimo paso del cron diario de .github/workflows/analyze.yml. El bucket
 * `backups` se crea solo si no existe, para no pedir un paso manual mas en el panel de
 * Supabase.
 */
import { gzipSync } from 'node:zlib';
import { config } from 'dotenv';
import { assertEnv } from '@/lib/env';
import { supabaseAdmin, type AdminClient } from '@/lib/supabase/admin';
import { DIAS_A_CONSERVAR, fechasARotar, partir } from '@/lib/backup/ndjson';
import { die } from './lib/context';

config({ path: '.env.local', quiet: true });

const BUCKET = 'backups';
const PAGE_SIZE = 1000;

async function ensureBucket(client: AdminClient): Promise<void> {
  const { data, error } = await client.storage.listBuckets();
  if (error) throw new Error(`No se pudo listar los buckets: ${error.message}`);
  if (data.some((bucket) => bucket.name === BUCKET)) return;
  const { error: createError } = await client.storage.createBucket(BUCKET, { public: false });
  if (createError) throw new Error(`No se pudo crear el bucket ${BUCKET}: ${createError.message}`);
}

async function dumpMoves(client: AdminClient): Promise<string[]> {
  const lines: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('moves')
      .select('game_id,ply,eval_cp,mate_in,best_uci,cp_loss,win_pct_loss,classification,is_decided')
      .not('eval_cp', 'is', null)
      .order('game_id')
      .order('ply')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`No se pudo leer moves: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) lines.push(JSON.stringify(row));
    if (data.length < PAGE_SIZE) break;
  }
  return lines;
}

async function dumpPuzzleAttempts(client: AdminClient): Promise<string[]> {
  const lines: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('puzzle_attempts')
      .select('*')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`No se pudo leer puzzle_attempts: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) lines.push(JSON.stringify(row));
    if (data.length < PAGE_SIZE) break;
  }
  return lines;
}

/**
 * Sube una parte comprimida. gzip no es un detalle: NDJSON de numeros comprime del orden de diez
 * veces, y es lo que deja cada parte muy por debajo del tope por objeto.
 */
async function upload(client: AdminClient, path: string, lineas: readonly string[]): Promise<void> {
  const comprimido = gzipSync(Buffer.from(lineas.join('\n'), 'utf8'));
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, new Blob([comprimido], { type: 'application/gzip' }), {
      contentType: 'application/gzip',
      upsert: true,
    });
  if (error) throw new Error(`No se pudo subir ${path}: ${error.message}`);
}

/**
 * Borra los respaldos del formato nuevo mas viejos que los ultimos `DIAS_A_CONSERVAR` dias.
 *
 * Solo toca carpetas `moves/<fecha>/` y archivos `puzzle_attempts/<fecha>.ndjson.gz`, que son los
 * que crea esta version. Los respaldos viejos de un solo bloque (`moves-<fecha>.ndjson`) no se
 * tocan: no los creo esta version y borrarlos seria decidir por el dueno.
 *
 * Corre DESPUES de subir el de hoy, nunca antes: si la subida falla, no se borra nada.
 */
async function rotar(client: AdminClient): Promise<string[]> {
  const { data: carpetas, error } = await client.storage.from(BUCKET).list('moves', { limit: 1000 });
  if (error) throw new Error(`No se pudo listar los respaldos: ${error.message}`);
  const fechas = (carpetas ?? []).map((c) => c.name);
  const aBorrar = fechasARotar(fechas);

  for (const fecha of aBorrar) {
    const { data: partes, error: errorPartes } = await client.storage
      .from(BUCKET)
      .list(`moves/${fecha}`, { limit: 1000 });
    if (errorPartes) throw new Error(`No se pudo listar moves/${fecha}: ${errorPartes.message}`);
    const rutas = [
      ...(partes ?? []).map((p) => `moves/${fecha}/${p.name}`),
      `puzzle_attempts/${fecha}.ndjson.gz`,
    ];
    const { error: errorBorrar } = await client.storage.from(BUCKET).remove(rutas);
    if (errorBorrar) throw new Error(`No se pudo rotar el respaldo ${fecha}: ${errorBorrar.message}`);
  }
  return aBorrar;
}

async function main(): Promise<void> {
  assertEnv();
  const client = supabaseAdmin();
  await ensureBucket(client);

  const today = new Date().toISOString().slice(0, 10);
  const moves = await dumpMoves(client);
  const puzzleAttempts = await dumpPuzzleAttempts(client);

  const partes = partir(moves);
  for (const [i, parte] of partes.entries()) {
    await upload(client, `moves/${today}/parte-${String(i).padStart(2, '0')}.ndjson.gz`, parte);
  }
  await upload(client, `puzzle_attempts/${today}.ndjson.gz`, puzzleAttempts);

  const rotados = await rotar(client);

  console.log(
    JSON.stringify({
      fecha: today,
      moves_filas: moves.length,
      moves_partes: partes.length,
      puzzle_attempts_filas: puzzleAttempts.length,
      dias_conservados: DIAS_A_CONSERVAR,
      rotados,
    }),
  );
}

main().catch(die);
