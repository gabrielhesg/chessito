import { revalidatePath } from 'next/cache';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { appEnv, env } from '@/lib/env';
import { runIngest } from '@/lib/ingest/run';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { healthSummary, monthlyActivity, monthlySummary } from '@/lib/data';
import { Muestra, Panel, Tabla, Vacio, filaAtenuada, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

const META_MENSUAL = 30;

/**
 * El numero principal es "partidas de rapida este mes" contra una meta de 30, y no la tasa de
 * blunders. Es deliberado: el riesgo real del proyecto es que construir la app reemplace a
 * jugar ajedrez, asi que la portada tiene que empujar a jugar.
 */
export default async function Portada() {
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
          <Tabla headers={['Mes', 'Tipo', 'n', 'Rendimiento', 'Wilson', 'Rating al cierre']}>
            {meses.slice(0, 18).map((m) => {
              const n = m.n ?? 0;
              return (
                <tr
                  key={`${m.month_local}-${m.time_class}`}
                  className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}
                >
                  <td className="py-1.5 pr-3 tabular-nums">{m.month_local}</td>
                  <td className="py-1.5 pr-3">{m.time_class}</td>
                  <td className="py-1.5 pr-3 tabular-nums">
                    <Muestra n={n} />
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(m.score_pct)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(m.score_pct_lower)}</td>
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
