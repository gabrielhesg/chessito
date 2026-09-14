import { revalidatePath } from 'next/cache';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { appEnv, env } from '@/lib/env';
import { runIngest } from '@/lib/ingest/run';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { healthSummary, monthlyActivity, monthlySummary } from '@/lib/data';
import { Ayuda, Panel, Rendimiento, SortableTh, Tabla, Vacio, filaAtenuada } from '@/components/ui';

export const dynamic = 'force-dynamic';

const META_MENSUAL = 30;

/**
 * El numero principal es "partidas de rapida este mes" contra una meta de 30, y no la tasa de
 * blunders. Es deliberado: el riesgo real del proyecto es que construir la app reemplace a
 * jugar ajedrez, asi que la portada tiene que empujar a jugar.
 */
type SortKey = 'month' | 'wilson' | 'n';
const SORT_KEYS: SortKey[] = ['month', 'wilson', 'n'];
function esSortKey(value: string | undefined): value is SortKey {
  return SORT_KEYS.includes(value as SortKey);
}

export default async function Portada({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const sort: SortKey = esSortKey(params.sort) ? params.sort : 'month';
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc';

  // El mes en curso viene ya agregado de `v_monthly_summary`: las agregaciones entre filas
  // viven en SQL, no en TypeScript.
  const mesActual = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());

  const [meses, salud, resumenMes] = await Promise.all([
    monthlyActivity(),
    healthSummary(),
    monthlySummary(mesActual),
  ]);

  const signo = dir === 'asc' ? 1 : -1;
  const mesesOrdenados = [...meses].sort((a, b) => {
    if (sort === 'n') return signo * ((a.n ?? 0) - (b.n ?? 0));
    if (sort === 'wilson') return signo * ((a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0));
    return (
      signo *
      ((a.month_local ?? '').localeCompare(b.month_local ?? '') || (a.time_class ?? '').localeCompare(b.time_class ?? ''))
    );
  });

  const link = (nextSort: string, nextDir: 'asc' | 'desc'): string => `/?sort=${nextSort}&dir=${nextDir}`;

  const rapidas = resumenMes?.n_rapid ?? 0;
  const totalMes = resumenMes?.n_games ?? 0;
  const avance = Math.min(100, Math.round((rapidas / META_MENSUAL) * 100));

  // El boton "Actualizar ahora": llama al MISMO runIngest que el cron. Existe porque la app
  // se abre justo despues de jugar y el cron gratuito de Vercel corre una vez al dia.
  async function actualizarAhora(): Promise<void> {
    'use server';
    await runIngest({
      store: new SupabaseIngestStore(supabaseAdmin()),
      client: new ChesscomClient({ username: env.CHESSCOM_USERNAME }),
      username: env.CHESSCOM_USERNAME,
      environment: appEnv(),
      trigger: 'manual',
      scope: { kind: 'recent' },
    });
    revalidatePath('/');
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--color-borde)] bg-[var(--color-panel)] p-6">
        <p className="text-xs uppercase tracking-wide text-[var(--color-tenue)]">
          Partidas de rapida este mes
        </p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl font-semibold tabular-nums">{rapidas}</span>
          <span className="text-lg text-[var(--color-tenue)]">/ {META_MENSUAL}</span>
        </p>
        <div className="mt-3 h-2 w-full overflow-hidden rounded bg-[var(--color-borde)]">
          <div
            className="h-full rounded bg-[var(--color-bien)]"
            style={{ width: `${avance}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-2 text-sm text-[var(--color-tenue)]">
          {rapidas >= META_MENSUAL
            ? 'Meta cumplida. Sigue jugando.'
            : `Faltan ${META_MENSUAL - rapidas} para la meta. ${totalMes} partidas en total este mes.`}
        </p>

        <form action={actualizarAhora} className="mt-4">
          <button
            type="submit"
            className="rounded border border-[var(--color-borde)] px-3 py-1.5 text-sm hover:bg-[var(--color-borde)]"
          >
            Actualizar ahora
          </button>
          <span className="ml-3 text-xs text-[var(--color-tenue)]">
            Trae el mes actual y el anterior desde chess.com.
          </span>
        </form>
      </section>

      {salud ? (
        <Panel title="Estado" subtitle="El detalle completo esta en /salud">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>
              Partidas guardadas: <strong className="tabular-nums">{salud.n_games ?? 0}</strong>
            </li>
            <li>
              Pendientes de analizar: <strong className="tabular-nums">{salud.n_pending ?? 0}</strong>
            </li>
            <li>
              Chequeos de calidad:{' '}
              <strong className={salud.checks_failing ? 'text-[var(--color-mal)]' : 'text-[var(--color-bien)]'}>
                {(salud.checks_total ?? 0) - (salud.checks_failing ?? 0)}/{salud.checks_total ?? 0}
              </strong>
            </li>
            <li>
              Ultima ingesta:{' '}
              <strong className={(salud.ingest_hours_old ?? 0) > 48 ? 'text-[var(--color-mal)]' : ''}>
                {salud.ingest_hours_old === null ? 'nunca' : `hace ${salud.ingest_hours_old} h`}
              </strong>
            </li>
          </ul>
        </Panel>
      ) : null}

      <Panel title="Actividad por mes" subtitle="Ultimos meses, por control de tiempo. El rendimiento se ordena por la cota inferior de Wilson; bajo 20 partidas la fila sale atenuada.">
        {meses.length === 0 ? (
          <Vacio>Todavia no hay partidas. Aprieta &quot;Actualizar ahora&quot;.</Vacio>
        ) : (
          <Tabla
            headers={[
              <SortableTh key="mes" label="Mes" sortKey="month" currentSort={sort} currentDir={dir} href={link} />,
              'Tipo',
              <span key="rendimiento" className="inline-flex items-center">
                <SortableTh label="Rendimiento" sortKey="wilson" currentSort={sort} currentDir={dir} href={link} />
                <Ayuda>
                  El número grande es la cota inferior de Wilson: corrige a la baja el porcentaje
                  bruto cuando la muestra es chica, para que no parezca mejor o peor de lo que es
                  por casualidad. Debajo, el porcentaje bruto y n (número de partidas del mes).
                </Ayuda>
              </span>,
              'Rating al cierre',
            ]}
          >
            {mesesOrdenados.slice(0, 18).map((m) => {
              const n = m.n ?? 0;
              return (
                <tr
                  key={`${m.month_local}-${m.time_class}`}
                  className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}
                >
                  <td className="py-1.5 pr-3 tabular-nums">{m.month_local}</td>
                  <td className="py-1.5 pr-3">{m.time_class}</td>
                  <td className="py-1.5 pr-3">
                    <Rendimiento pctValue={m.score_pct} wilson={m.score_pct_lower} n={n} />
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{m.rating_at_month_end ?? '—'}</td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </Panel>
    </div>
  );
}
