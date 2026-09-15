import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { dataQuality, gamesByMonth, healthJobs, healthSummary, lastJobRuns, ultimaReconciliacion } from '@/lib/data';
import { dispatchWorkflow } from '@/lib/github';
import {
  Badge,
  Button,
  EmptyState,
  Fila,
  Pagina,
  Panel,
  Semaforo,
  Stat,
  Tabla,
  Td,
} from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * La pantalla que permite confiar en el resto sin abrir la consola (docs/CONFIANZA.md).
 * Sin ella, todo lo demas son numeros que hay que creer a ciegas.
 */
export default async function SaludPage({
  searchParams,
}: {
  searchParams: Promise<{ analisis?: string; error?: string }>;
}) {
  const params = await searchParams;
  const [chequeos, jobs, resumen, corridas, meses, reconciliacion] = await Promise.all([
    dataQuality(),
    healthJobs(),
    healthSummary(),
    lastJobRuns(15),
    gamesByMonth(),
    ultimaReconciliacion(),
  ]);

  const ingesta = jobs.find((j) => j.kind === 'ingest');
  const horas = ingesta?.hours_since_success ?? null;
  const vieja = horas === null || horas > 48;
  const fallando = chequeos.filter((c) => c.ok === false);

  // El boton "Analizar ahora": el analisis con Stockfish no puede correr en Vercel (necesita
  // un binario nativo y minutos, no segundos), asi que en vez de correrlo aca se dispara el
  // workflow analyze.yml de GitHub Actions, para que Gabriel no tenga que entrar a GitHub.
  async function analizarAhora(): Promise<void> {
    'use server';
    try {
      await dispatchWorkflow('analyze.yml', { batch: '200' });
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      redirect(`/salud?error=${encodeURIComponent(mensaje)}`);
    }
    revalidatePath('/salud');
    redirect('/salud?analisis=disparado');
  }

  return (
    <Pagina
      titulo="Salud"
      subtitulo={
        <>
          Estado de la ingesta, calidad de los datos y últimas corridas. Sin esta pantalla, todo lo demás son números que hay que creer a ciegas.
        </>
      }
    >
      <div className="space-y-6">
        {params.analisis === 'disparado' ? (
          <p className="rounded-lg border border-bien/40 bg-bien/10 px-3 py-2 text-sm text-bien">
            Se disparó el workflow de análisis en GitHub Actions. Va a tardar unos minutos en
            aparecer acá abajo, en &quot;Últimas corridas&quot;.
          </p>
        ) : null}
        {params.error ? (
          <p className="rounded-lg border border-critico/40 bg-critico/10 px-3 py-2 text-sm text-critico">
            {params.error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            etiqueta="Última ingesta"
            valor={horas === null ? 'nunca' : `${horas} h`}
            tono={vieja ? 'critico' : 'bien'}
            detalle={
              horas === null
                ? 'Los datos pueden estar incompletos'
                : vieja
                  ? 'Más de 48 h: los datos están viejos'
                  : 'Al día'
            }
          />
          <Stat
            etiqueta="Chequeos de calidad"
            valor={`${chequeos.length - fallando.length}/${chequeos.length}`}
            tono={fallando.length > 0 ? 'critico' : 'bien'}
            detalle={fallando.length > 0 ? `${fallando.length} fallando` : 'Todos en verde'}
          />
          <Stat
            etiqueta="Partidas analizadas"
            valor={(resumen?.n_analyzed ?? 0).toLocaleString('es-CL')}
            detalle={`de ${(resumen?.n_games ?? 0).toLocaleString('es-CL')} de ajedrez`}
          />
          <Stat
            etiqueta="Pendientes de analizar"
            valor={(resumen?.n_pending ?? 0).toLocaleString('es-CL')}
            detalle={
              ingesta && (ingesta.failures_7d ?? 0) > 0
                ? `${ingesta.failures_7d} corridas fallidas en 7 días`
                : 'El motor corre en GitHub Actions'
            }
            tono={ingesta && (ingesta.failures_7d ?? 0) > 0 ? 'aviso' : undefined}
          />
        </div>

        <Panel
          title="Analizar"
          subtitle="Dispara el workflow de GitHub Actions (lote de 200 partidas). Corre aparte, en GitHub, no en Vercel: tarda minutos, no segundos."
        >
          <form action={analizarAhora}>
            <Button type="submit" variante="primario" pendingLabel="Disparando…">
              Analizar ahora
            </Button>
          </form>
        </Panel>

        <Panel
          title={`Chequeos de calidad de datos (${chequeos.length - fallando.length}/${chequeos.length})`}
          subtitle="Todos tienen que dar cero. Cada uno existe porque hay una forma concreta de romperlo."
        >
          {chequeos.length === 0 ? (
            <EmptyState titulo="La vista v_data_quality no devolvió filas" />
          ) : (
            <Tabla
              aligns={['text', 'num', 'text']}
              headers={['Chequeo', 'Infractores', 'Qué detecta']}
            >
              {[...chequeos]
                .sort((a, b) => Number(a.ok ?? true) - Number(b.ok ?? true))
                .map((c) => (
                  <Fila key={c.check_name}>
                    <Td>
                      <Semaforo ok={c.ok ?? false}>{c.check_name}</Semaforo>
                    </Td>
                    <Td num className={c.ok ? '' : 'font-semibold text-critico'}>
                      {c.offenders ?? 0}
                    </Td>
                    <Td className="text-tenue">{c.descripcion}</Td>
                  </Fila>
                ))}
            </Tabla>
          )}
        </Panel>

        <Panel
          title="Reconciliación contra chess.com"
          subtitle="De las partidas que chess.com reporta en cada archivo mensual, cuántas quedaron guardadas. Se compara uuid a uuid."
        >
          {reconciliacion === null ? (
            <EmptyState titulo="Todavía no hay una ingesta con reconciliación registrada" />
          ) : (
            <>
              <p className="mb-3 text-sm">
                <Semaforo ok={reconciliacion.ok}>
                  {reconciliacion.ok
                    ? `Calzan todas las partidas de los ${reconciliacion.meses.length} archivos sincronizados.`
                    : `Faltan ${reconciliacion.meses.reduce((total, m) => total + m.missing, 0)} partidas que chess.com sí reporta.`}
                </Semaforo>{' '}
                <span className="text-tenue">
                  Corrida del{' '}
                  {new Date(reconciliacion.startedAt).toLocaleString('es-CL', {
                    timeZone: 'America/Santiago',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  .
                </span>
              </p>
              <Tabla
                aligns={['text', 'num', 'num', 'num', 'text']}
                headers={['Archivo', 'chess.com', 'Guardadas', 'Faltan', 'Cuáles']}
              >
                {[...reconciliacion.meses]
                  .sort((a, b) => b.missing - a.missing || b.month.localeCompare(a.month))
                  .slice(0, 24)
                  .map((m) => (
                    <Fila key={m.month} className={m.missing > 0 ? 'text-critico' : ''}>
                      <Td className="tabular-nums">{m.month}</Td>
                      <Td num>{m.remote}</Td>
                      <Td num>{m.stored}</Td>
                      <Td num>{m.missing}</Td>
                      <Td className="font-mono text-2xs">
                        {m.missing_uuids?.length ? m.missing_uuids.join(', ') : '—'}
                      </Td>
                    </Fila>
                  ))}
              </Tabla>
            </>
          )}
        </Panel>

        <Panel title="Últimas corridas" subtitle="Todo proceso batch abre y cierra una fila en job_runs">
          {corridas.length === 0 ? (
            <EmptyState titulo="Todavía no hay corridas registradas" />
          ) : (
            <Tabla
              aligns={['text', 'text', 'text', 'text', 'num', 'num', 'num', 'num']}
              headers={['Cuándo', 'Proceso', 'Estado', 'Ambiente', 'Procesadas', 'Fallidas', 'Saltadas', 'Duración']}
            >
              {corridas.map((r) => (
                <Fila key={r.id}>
                  <Td className="whitespace-nowrap tabular-nums text-tenue">
                    {new Date(r.started_at).toLocaleString('es-CL', {
                      timeZone: 'America/Santiago',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </Td>
                  <Td>
                    <Badge>{r.kind}</Badge>
                  </Td>
                  <Td>
                    <Semaforo ok={r.status === 'success'}>{r.status}</Semaforo>
                  </Td>
                  <Td className="text-tenue">
                    {r.environment} · {r.trigger}
                  </Td>
                  <Td num>{r.processed}</Td>
                  <Td num className={r.failed ? 'text-critico' : ''}>
                    {r.failed}
                  </Td>
                  <Td num>{r.skipped}</Td>
                  <Td num>{r.duration_ms === null ? '—' : `${(r.duration_ms / 1000).toFixed(1)} s`}</Td>
                </Fila>
              ))}
            </Tabla>
          )}
        </Panel>

        <Panel title="Partidas por mes" subtitle="Mes local de Santiago, para comparar de un vistazo">
          {meses.length === 0 ? (
            <EmptyState titulo="Sin partidas" />
          ) : (
            <Tabla aligns={['text', 'num', 'num', 'num']} headers={['Mes', 'Total', 'Ajedrez', 'Saltadas']}>
              {meses.map((m) => (
                <Fila key={m.month_local}>
                  <Td className="tabular-nums">{m.month_local}</Td>
                  <Td num>{m.n_local}</Td>
                  <Td num>{m.n_chess}</Td>
                  <Td num>{m.n_skipped}</Td>
                </Fila>
              ))}
            </Tabla>
          )}
        </Panel>
      </div>
    </Pagina>
  );
}
