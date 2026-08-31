import { dataQuality, gamesByMonth, healthJobs, healthSummary, lastJobRuns, ultimaReconciliacion } from '@/lib/data';
import { Panel, Semaforo, Tabla, Vacio } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * La pantalla que permite confiar en el resto sin abrir la consola (docs/CONFIANZA.md).
 * Sin ella, todo lo demas son numeros que hay que creer a ciegas.
 */
export default async function SaludPage() {
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Salud</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Estado de la ingesta, calidad de los datos y ultimas corridas.
        </p>
      </header>

      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          vieja
            ? 'border-[var(--color-mal)] text-[var(--color-mal)]'
            : 'border-[var(--color-bien)] text-[var(--color-bien)]'
        }`}
      >
        {horas === null
          ? 'Nunca ha corrido una ingesta con exito. Los datos que ves pueden estar incompletos.'
          : vieja
            ? `La ultima ingesta con exito fue hace ${horas} horas. Mas de 48: los datos estan viejos.`
            : `Ultima ingesta con exito hace ${horas} horas.`}
        {ingesta && (ingesta.failures_7d ?? 0) > 0 ? (
          <span className="ml-2">· {ingesta.failures_7d} corridas fallidas en los ultimos 7 dias.</span>
        ) : null}
        {ingesta && (ingesta.stuck_runs ?? 0) > 0 ? (
          <span className="ml-2">· {ingesta.stuck_runs} corridas trabadas en &quot;running&quot;.</span>
        ) : null}
      </div>

      <Panel
        title={`Chequeos de calidad de datos (${chequeos.length - fallando.length}/${chequeos.length})`}
        subtitle="Todos tienen que dar cero. Cada uno existe porque hay una forma concreta de romperlo."
      >
        {chequeos.length === 0 ? (
          <Vacio>La vista v_data_quality no devolvio filas.</Vacio>
        ) : (
          <Tabla headers={['Chequeo', 'Infractores', 'Que detecta']}>
            {[...chequeos]
              .sort((a, b) => Number(a.ok ?? true) - Number(b.ok ?? true))
              .map((c) => (
                <tr key={c.check_name} className="border-b border-[var(--color-borde)]/50">
                  <td className="py-1.5 pr-3">
                    <Semaforo ok={c.ok ?? false}>{c.check_name}</Semaforo>
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{c.offenders ?? 0}</td>
                  <td className="py-1.5 pr-3 text-[var(--color-tenue)]">{c.descripcion}</td>
                </tr>
              ))}
          </Tabla>
        )}
      </Panel>

      <Panel
        title="Reconciliacion contra chess.com"
        subtitle="De las partidas que chess.com reporta en cada archivo mensual, cuantas quedaron guardadas. Se compara uuid a uuid."
      >
        {reconciliacion === null ? (
          <Vacio>Todavia no hay una ingesta con reconciliacion registrada.</Vacio>
        ) : (
          <>
            <p className={`mb-3 text-sm ${reconciliacion.ok ? 'text-[var(--color-bien)]' : 'text-[var(--color-mal)]'}`}>
              <Semaforo ok={reconciliacion.ok}>
                {reconciliacion.ok
                  ? `Calzan todas las partidas de los ${reconciliacion.meses.length} archivos sincronizados.`
                  : `Faltan ${reconciliacion.meses.reduce((total, m) => total + m.missing, 0)} partidas que chess.com si reporta.`}
              </Semaforo>{' '}
              <span className="text-[var(--color-tenue)]">
                Corrida del{' '}
                {new Date(reconciliacion.startedAt).toLocaleString('es-CL', {
                  timeZone: 'America/Santiago',
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
                .
              </span>
            </p>
            <Tabla headers={['Archivo', 'chess.com', 'Guardadas', 'Faltan', 'Cuales']}>
              {[...reconciliacion.meses]
                .sort((a, b) => b.missing - a.missing || b.month.localeCompare(a.month))
                .slice(0, 24)
                .map((m) => (
                  <tr
                    key={m.month}
                    className={`border-b border-[var(--color-borde)]/50 ${m.missing > 0 ? 'text-[var(--color-mal)]' : ''}`}
                  >
                    <td className="py-1.5 pr-3 tabular-nums">{m.month}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{m.remote}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{m.stored}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{m.missing}</td>
                    <td className="py-1.5 pr-3 font-mono text-xs">
                      {m.missing_uuids?.length ? m.missing_uuids.join(', ') : '—'}
                    </td>
                  </tr>
                ))}
            </Tabla>
          </>
        )}
      </Panel>

      <Panel title="Ultimas corridas" subtitle="Todo proceso batch abre y cierra una fila en job_runs">
        {corridas.length === 0 ? (
          <Vacio>Todavia no hay corridas registradas.</Vacio>
        ) : (
          <Tabla
            headers={['Cuando', 'Proceso', 'Estado', 'Ambiente', 'Disparo', 'Procesadas', 'Fallidas', 'Saltadas', 'Duracion']}
          >
            {corridas.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-borde)]/50">
                <td className="py-1.5 pr-3 tabular-nums">
                  {new Date(r.started_at).toLocaleString('es-CL', {
                    timeZone: 'America/Santiago',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="py-1.5 pr-3">{r.kind}</td>
                <td className="py-1.5 pr-3">
                  <Semaforo ok={r.status === 'success'}>{r.status}</Semaforo>
                </td>
                <td className="py-1.5 pr-3">{r.environment}</td>
                <td className="py-1.5 pr-3">{r.trigger}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.processed}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.failed}</td>
                <td className="py-1.5 pr-3 tabular-nums">{r.skipped}</td>
                <td className="py-1.5 pr-3 tabular-nums">
                  {r.duration_ms === null ? '—' : `${(r.duration_ms / 1000).toFixed(1)} s`}
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Partidas por mes" subtitle="Mes local de Santiago, para comparar de un vistazo">
          {meses.length === 0 ? (
            <Vacio>Sin partidas.</Vacio>
          ) : (
            <Tabla headers={['Mes', 'Total', 'Ajedrez', 'Saltadas']}>
              {meses.map((m) => (
                <tr key={m.month_local} className="border-b border-[var(--color-borde)]/50">
                  <td className="py-1.5 pr-3 tabular-nums">{m.month_local}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{m.n_local}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{m.n_chess}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{m.n_skipped}</td>
                </tr>
              ))}
            </Tabla>
          )}
        </Panel>

        <Panel title="Analisis" subtitle="Cuanto falta para tener el historico analizado (Fase 3)">
          <ul className="space-y-1 text-sm">
            <li>
              Partidas de ajedrez: <strong className="tabular-nums">{resumen?.n_games ?? 0}</strong>
            </li>
            <li>
              Analizadas: <strong className="tabular-nums">{resumen?.n_analyzed ?? 0}</strong>
            </li>
            <li>
              Pendientes de analizar: <strong className="tabular-nums">{resumen?.n_pending ?? 0}</strong>
            </li>
          </ul>

        </Panel>
      </div>
    </div>
  );
}
