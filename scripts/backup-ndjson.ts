/**
 * Respaldo NDJSON de `moves` (columnas del motor) y `puzzle_attempts` a Supabase Storage.
 * Son los unicos datos del sistema que no se pueden reconstruir desde chess.com: el PGN es la
 * fuente de verdad y se puede volver a analizar, pero las evaluaciones de Stockfish y el
 * historial de intentos del entrenador cuestan tiempo de motor y no.
 *
 * Corre como el ultimo paso del cron diario de .github/workflows/analyze.yml. El bucket
 * `backups` se crea solo si no existe, para no pedir un paso manual mas en el panel de
 * Supabase.
 */
import { config } from 'dotenv';
import { assertEnv } from '@/lib/env';
import { supabaseAdmin, type AdminClient } from '@/lib/supabase/admin';
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

async function dumpMoves(client: AdminClient): Promise<string> {
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
  return lines.join('\n');
}

async function dumpPuzzleAttempts(client: AdminClient): Promise<string> {
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
  return lines.join('\n');
}

async function upload(client: AdminClient, path: string, ndjson: string): Promise<void> {
  const { error } = await client.storage
    .from(BUCKET)
    .upload(path, new Blob([ndjson], { type: 'application/x-ndjson' }), {
      contentType: 'application/x-ndjson',
      upsert: true,
    });
  if (error) throw new Error(`No se pudo subir ${path}: ${error.message}`);
}

async function main(): Promise<void> {
  assertEnv();
  const client = supabaseAdmin();
  await ensureBucket(client);

  const today = new Date().toISOString().slice(0, 10);
  const movesNdjson = await dumpMoves(client);
  const puzzleAttemptsNdjson = await dumpPuzzleAttempts(client);

  await upload(client, `moves-${today}.ndjson`, movesNdjson);
  await upload(client, `puzzle_attempts-${today}.ndjson`, puzzleAttemptsNdjson);

  console.log(
    JSON.stringify({
      fecha: today,
      moves_filas: movesNdjson === '' ? 0 : movesNdjson.split('\n').length,
      puzzle_attempts_filas: puzzleAttemptsNdjson === '' ? 0 : puzzleAttemptsNdjson.split('\n').length,
    }),
  );
}

main().catch(die);
