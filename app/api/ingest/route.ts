import { NextResponse, type NextRequest } from 'next/server';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { appEnv, env } from '@/lib/env';
import { runIngest, type IngestScope } from '@/lib/ingest/run';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { log } from '@/lib/log';

/**
 * Exporta GET porque el cron de Vercel dispara con GET.
 *
 * Esta ruta esta EXCLUIDA del middleware de sesion (ver middleware.ts): se protege sola con
 * `CRON_SECRET` en el header Authorization. Es el mismo `runIngest` que corre `pnpm ingest`.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function autorizado(request: NextRequest): boolean {
  const header = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  // Comparacion de largo fijo no aporta aca (el secreto no se filtra por tiempo de red),
  // pero se compara completo y sin normalizar.
  return header === expected;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!autorizado(request)) {
    return NextResponse.json({ error: 'no autorizado' }, { status: 401 });
  }

  const scope: IngestScope = request.nextUrl.searchParams.get('scope') === 'full'
    ? { kind: 'full' }
    : { kind: 'recent' };
  const trigger = request.nextUrl.searchParams.get('trigger') === 'boton' ? 'manual' : 'cron';

  const store = new SupabaseIngestStore(supabaseAdmin());

  try {
    const summary = await runIngest({
      store,
      client: new ChesscomClient({ username: env.CHESSCOM_USERNAME }),
      username: env.CHESSCOM_USERNAME,
      environment: appEnv(),
      trigger,
      scope,
    });

    return NextResponse.json(
      {
        status: summary.status,
        meses: summary.months,
        procesadas: summary.processed,
        fallidas: summary.failed,
        saltadas: summary.skipped,
        reconciliacion_ok: summary.reconciliationOk,
        faltantes: summary.reconciliation.filter((r) => r.missing > 0),
      },
      { status: summary.status === 'success' ? 200 : 500 },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    log.error('La ingesta fallo', { reason });
    return NextResponse.json({ status: 'failed', error: reason }, { status: 500 });
  }
}
