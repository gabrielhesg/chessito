import { moveTimeByPhase, moveTimeByPly, moveTimeDistribution, timeoutMoment } from '@/lib/data';
import { Muestra, Panel, Tabla, Vacio, filaAtenuada, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

const NOMBRE_FASE: Record<number, string> = { 0: 'Apertura', 1: 'Medio juego', 2: 'Final' };
const ORDEN_BUCKET = ['<3s', '3-10s', '10-30s', '>30s'] as const;

function segundos(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Pregunta 4 (parcial, se completa en Fase 3): uso del reloj. Nada de esto necesita el motor,
 * sale de `moves.move_time_ms` y `moves.phase`, poblados por `pnpm moves:extract`.
 */
export default async function RelojPage() {
  const [porJugada, porFase, distribucion, timeouts] = await Promise.all([
    moveTimeByPly(),
    moveTimeByPhase(),
    moveTimeDistribution(),
    timeoutMoment(),
  ]);

  const totalTimeouts = timeouts.reduce((acc, t) => acc + (t.n_games ?? 0), 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Reloj</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Donde piensa Gabriel. Sin motor todavia: la clasificacion de si esas jugadas rapidas
          fueron buenas o malas la agrega la Fase 3. Toda fila muestra su n.
        </p>
      </header>

      <Panel
        title="Por fase"
        subtitle="Porcentaje de jugadas bajo 3 segundos, con la cota inferior de Wilson"
      >
        {porFase.length === 0 ? (
          <Vacio>Sin jugadas extraidas todavia. Corre `pnpm moves:extract`.</Vacio>
        ) : (
          <Tabla headers={['Fase', 'n', 'Tiempo promedio', '% bajo 3s (Wilson)']}>
            {porFase.map((f) => {
              const n = f.n ?? 0;
              const fase = f.phase ?? 0;
              return (
                <tr key={fase} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                  <td className="py-1.5 pr-3">{NOMBRE_FASE[fase] ?? fase}</td>
                  <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                  <td className="py-1.5 pr-3 tabular-nums">{segundos(f.avg_move_time_ms)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(f.pct_under_3s_lower)}</td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </Panel>

      <Panel
        title="Distribucion de tiempos, por fase"
        subtitle="Cuantas jugadas caen en cada rango de tiempo"
      >
        {distribucion.length === 0 ? (
          <Vacio>Sin jugadas extraidas todavia.</Vacio>
        ) : (
          <div className="space-y-4">
            {[0, 1, 2].map((fase) => {
              const filas = distribucion.filter((d) => d.phase === fase);
              if (filas.length === 0) return null;
              const total = filas.reduce((acc, f) => acc + (f.n ?? 0), 0);
              return (
                <div key={fase}>
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--color-tenue)]">
                    {NOMBRE_FASE[fase]}
                  </h3>
                  <Tabla headers={['Rango', 'n', '% de la fase']}>
                    {ORDEN_BUCKET.map((bucket) => {
                      const fila = filas.find((f) => f.time_bucket === bucket);
                      const n = fila?.n ?? 0;
                      return (
                        <tr key={bucket} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                          <td className="py-1.5 pr-3">{bucket}</td>
                          <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                          <td className="py-1.5 pr-3 tabular-nums">{pct(total > 0 ? n / total : null)}</td>
                        </tr>
                      );
                    })}
                  </Tabla>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel
        title="Tiempo por numero de jugada"
        subtitle="Tiempo promedio y mediana, jugada a jugada (hasta el ply 60)"
      >
        {porJugada.length === 0 ? (
          <Vacio>Sin jugadas extraidas todavia.</Vacio>
        ) : (
          <div className="overflow-x-auto">
            <Tabla headers={['Ply', 'n', 'Promedio', 'Mediana']}>
              {porJugada.map((p) => {
                const n = p.n ?? 0;
                return (
                  <tr key={p.ply} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                    <td className="py-1.5 pr-3 tabular-nums">{p.ply}</td>
                    <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                    <td className="py-1.5 pr-3 tabular-nums">{segundos(p.avg_move_time_ms)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{segundos(p.median_move_time_ms)}</td>
                  </tr>
                );
              })}
            </Tabla>
          </div>
        )}
      </Panel>

      <Panel
        title="Se le acaba el tiempo"
        subtitle="En que fase estaba jugando en las derrotas por tiempo (termination = timeout)"
      >
        {timeouts.length === 0 ? (
          <Vacio>Sin derrotas por tiempo registradas todavia.</Vacio>
        ) : (
          <Tabla headers={['Fase', 'n', 'Ply promedio de la ultima jugada']}>
            {timeouts.map((t) => {
              const n = t.n_games ?? 0;
              const fase = t.phase ?? 0;
              return (
                <tr key={fase} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                  <td className="py-1.5 pr-3">{NOMBRE_FASE[fase] ?? fase}</td>
                  <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                  <td className="py-1.5 pr-3 tabular-nums">{t.avg_ply ?? '—'}</td>
                </tr>
              );
            })}
          </Tabla>
        )}
        <p className="mt-2 text-xs text-[var(--color-tenue)]">{totalTimeouts} derrotas por tiempo en total.</p>
      </Panel>
    </div>
  );
}
