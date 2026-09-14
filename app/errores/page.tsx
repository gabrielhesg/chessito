import { analysisCoverage, errorsByMoveTime, errorsByPhase, errorsDiagnostic } from '@/lib/data';
import { Ayuda, Panel, Tabla, Vacio, filaAtenuada, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

const NOMBRE_FASE: Record<number, string> = { 0: 'Apertura', 1: 'Medio juego', 2: 'Final' };
const ORDEN_BUCKET = ['<3s', '3-10s', '10-30s', '>30s'] as const;

const AYUDA_JUGADAS = (
  <Ayuda>
    Número de jugadas en este corte. Bajo 20 la fila sale atenuada: con pocas jugadas la tasa de
    error puede ser casualidad, no un patrón real.
  </Ayuda>
);

/** Pregunta 3 (blunders reales) y el cierre de la pregunta 4 (tiempo vs errores). */
export default async function ErroresPage() {
  const [cobertura, porFase, porTiempo] = await Promise.all([
    analysisCoverage(),
    errorsByPhase(),
    errorsByMoveTime(),
  ]);

  const analizadas = cobertura.reduce((s, c) => s + (c.n_analyzed ?? 0), 0);
  const totales = cobertura.reduce((s, c) => s + (c.n_games ?? 0), 0);
  const clases = [...new Set(porFase.map((f) => f.time_class).filter((c): c is string => c !== null))].sort();

  // Hay partidas analizadas pero las tablas de abajo salen vacias: algo esta filtrando todas
  // las filas (is_mine, is_book o is_decided). En vez de pedir una consulta a mano, la propia
  // app se responde con el mismo desglose.
  const diagnostico = analizadas > 0 && porFase.length === 0 ? await errorsDiagnostic() : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Errores</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Basado en {analizadas} de {totales} partidas analizadas. Se excluyen las jugadas de
          libro y las de partidas ya decididas (win% del que mueve sobre 95 o bajo 5): jugar
          flojo en una partida ganada no cuenta como blunder.
        </p>
      </header>

      {diagnostico ? (
        <Panel
          title="Diagnostico"
          subtitle="Hay partidas analizadas pero las tablas de abajo salen vacias. Este es el desglose de por que."
        >
          <ul className="space-y-1 text-sm">
            <li>
              Jugadas con clasificacion (de cualquiera): <strong className="tabular-nums">{diagnostico.conClasificacion}</strong>
            </li>
            <li>
              De esas, mias (<code>is_mine</code>): <strong className="tabular-nums">{diagnostico.mias}</strong>
            </li>
            <li>
              De esas, fuera de libro (<code>is_book = false</code>): <strong className="tabular-nums">{diagnostico.miasNoLibro}</strong>
            </li>
            <li>
              De esas, en partida no decidida (<code>is_decided = false</code>):{' '}
              <strong className="tabular-nums">{diagnostico.miasNoLibroNoDecidida}</strong>
            </li>
          </ul>
          <p className="mt-2 text-xs text-[var(--color-tenue)]">
            El escalon donde el numero se cae a 0 (o queda muy chico) es el filtro responsable.
          </p>
        </Panel>
      ) : null}

      <Panel title="Blunders por fase" subtitle="Tasa de errores segun en que momento de la partida ocurren">
        {porFase.length === 0 ? (
          <Vacio>Sin partidas analizadas todavia. Corre `pnpm analyze` (o espera al cron diario).</Vacio>
        ) : (
          <div className="space-y-4">
            {clases.map((clase) => {
              const filas = porFase.filter((f) => f.time_class === clase).sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0));
              if (filas.length === 0) return null;
              return (
                <div key={clase}>
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--color-tenue)]">{clase}</h3>
                  <Tabla
                    headers={[
                      'Fase',
                      <span key="j" className="inline-flex items-center">Jugadas{AYUDA_JUGADAS}</span>,
                      'Graves',
                      'Errores',
                      'Imprecisiones',
                      'CP perdidos prom.',
                    ]}
                  >
                    {filas.map((f) => {
                      const n = f.n_moves ?? 0;
                      const fase = f.phase ?? 0;
                      return (
                        <tr key={fase} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                          <td className="py-1.5 pr-3">{NOMBRE_FASE[fase] ?? fase}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{n}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{f.blunders ?? 0}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{f.mistakes ?? 0}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{f.inaccuracies ?? 0}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{f.avg_cp_loss?.toFixed(0) ?? '—'}</td>
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
        title="Errores segun el tiempo de la jugada"
        subtitle="¿Los errores se concentran en las jugadas rapidas?"
      >
        {porTiempo.length === 0 ? (
          <Vacio>Sin partidas analizadas todavia.</Vacio>
        ) : (
          <div className="space-y-4">
            {clases.map((clase) => {
              const filas = porTiempo.filter((f) => f.time_class === clase);
              if (filas.length === 0) return null;
              return (
                <div key={clase}>
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--color-tenue)]">{clase}</h3>
                  <Tabla
                    headers={[
                      'Rango',
                      <span key="j" className="inline-flex items-center">Jugadas{AYUDA_JUGADAS}</span>,
                      'Tasa de error',
                      'CP perdidos prom.',
                    ]}
                  >
                    {ORDEN_BUCKET.map((bucket) => {
                      const fila = filas.find((f) => f.time_bucket === bucket);
                      const n = fila?.n_moves ?? 0;
                      return (
                        <tr key={bucket} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                          <td className="py-1.5 pr-3">{bucket}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{n}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{pct(fila?.error_rate)}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{fila?.avg_cp_loss?.toFixed(0) ?? '—'}</td>
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
    </div>
  );
}
