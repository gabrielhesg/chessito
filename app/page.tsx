import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { appEnv, env } from '@/lib/env';
import { runIngest } from '@/lib/ingest/run';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { healthSummary, monthlyActivity, monthlySummary } from '@/lib/data';
import {
  Ayuda,
  Badge,
  Button,
  Panel,
  Progreso,
  Rendimiento,
  SortableTh,
  Stat,
  Tabla,
  Td,
  Fila,
  Vacio,
} from '@/components/ui';
import { Sparkline } from '@/components/charts/Sparkline';

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

  // Tendencia de rating: el tipo de partida mas jugado, en orden cronologico. `monthlyActivity`
  // viene del mas reciente al mas viejo, asi que se invierte para que la linea lea de izq a der.
  const claseDominante = mesesOrdenados.reduce<{ clase: string; n: number }>(
    (mejor, m) => ((m.n ?? 0) > mejor.n ? { clase: m.time_class ?? '', n: m.n ?? 0 } : mejor),
    { clase: '', n: 0 },
  ).clase;
  const tendenciaRating = [...meses]
    .filter((m) => m.time_class === claseDominante && m.rating_at_month_end !== null)
    .sort((a, b) => (a.month_local ?? '').localeCompare(b.month_local ?? ''))
    .map((m) => m.rating_at_month_end as number);
  const ratingActual = tendenciaRating.at(-1);
  const ratingPrevio = tendenciaRating.at(-2);
  const deltaRating = ratingActual !== undefined && ratingPrevio !== undefined ? ratingActual - ratingPrevio : null;

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
      <section className="rounded-xl border border-borde bg-panel p-6 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-2xs uppercase tracking-wider text-tenue">Partidas de rápida este mes</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-semibold tabular-nums">{rapidas}</span>
              <span className="text-lg text-tenue">/ {META_MENSUAL}</span>
            </p>
          </div>
          <form action={actualizarAhora}>
            <Button type="submit" variante="fantasma" pendingLabel="Actualizando…">
              Actualizar ahora
            </Button>
          </form>
        </div>

        <div className="mt-4">
          <Progreso valor={avance} />
        </div>
        <p className="mt-2 text-sm text-tenue">
          {rapidas >= META_MENSUAL
            ? 'Meta cumplida. Sigue jugando.'
            : `Faltan ${META_MENSUAL - rapidas} para la meta. ${totalMes} partidas en total este mes.`}
        </p>
      </section>

      {salud ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            etiqueta={`Rating ${claseDominante || ''}`.trim()}
            valor={ratingActual ?? '—'}
            detalle={
              deltaRating === null
                ? 'Al cierre del último mes'
                : `${deltaRating >= 0 ? '+' : ''}${deltaRating} vs el mes anterior`
            }
            tono={deltaRating === null ? undefined : deltaRating >= 0 ? 'bien' : 'critico'}
          >
            <Sparkline
              valores={tendenciaRating}
              tono={deltaRating !== null && deltaRating < 0 ? 'critico' : 'acento'}
            />
          </Stat>
          <Stat etiqueta="Partidas guardadas" valor={(salud.n_games ?? 0).toLocaleString('es-CL')} />
          <Stat
            etiqueta="Pendientes de analizar"
            valor={(salud.n_pending ?? 0).toLocaleString('es-CL')}
            detalle={salud.n_pending ? 'El motor corre en GitHub Actions' : 'Todo analizado'}
          />
          <Stat
            etiqueta="Chequeos de calidad"
            valor={`${(salud.checks_total ?? 0) - (salud.checks_failing ?? 0)}/${salud.checks_total ?? 0}`}
            tono={salud.checks_failing ? 'critico' : 'bien'}
            detalle={
              salud.ingest_hours_old === null
                ? 'Nunca se ingirió'
                : `Última ingesta hace ${salud.ingest_hours_old} h`
            }
          />
        </div>
      ) : null}

      <Panel
        title="Actividad por mes"
        subtitle="Rendimiento por control de tiempo, ordenado por la cota inferior de Wilson. Bajo 20 partidas la fila sale atenuada."
        actions={
          <Link href="/registro" className="text-xs text-acento hover:underline">
            Ver todas las partidas →
          </Link>
        }
      >
        {meses.length === 0 ? (
          <Vacio>Todavía no hay partidas. Aprieta &quot;Actualizar ahora&quot;.</Vacio>
        ) : (
          <Tabla
            aligns={['text', 'text', 'num', 'num']}
            headers={[
              <SortableTh key="mes" label="Mes" sortKey="month" currentSort={sort} currentDir={dir} href={link} />,
              'Tipo',
              <span key="rendimiento" className="inline-flex items-center">
                <SortableTh label="Rendimiento" sortKey="wilson" currentSort={sort} currentDir={dir} href={link} />
                <Ayuda alinear="der">
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
                <Fila key={`${m.month_local}-${m.time_class}`} atenuada={n < 20}>
                  <Td className="tabular-nums">{m.month_local}</Td>
                  <Td>
                    <Badge>{m.time_class}</Badge>
                  </Td>
                  <Td num>
                    <Rendimiento pctValue={m.score_pct} wilson={m.score_pct_lower} n={n} />
                  </Td>
                  <Td num>{m.rating_at_month_end ?? '—'}</Td>
                </Fila>
              );
            })}
          </Tabla>
        )}
      </Panel>
    </div>
  );
}
