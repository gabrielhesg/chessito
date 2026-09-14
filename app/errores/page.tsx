import { analysisCoverage, errorsByMoveTime, errorsByPhase } from '@/lib/data';
import { Muestra, Panel, Tabla, Vacio, filaAtenuada, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

const NOMBRE_FASE: Record<number, string> = { 0: 'Apertura', 1: 'Medio juego', 2: 'Final' };
const ORDEN_BUCKET = ['<3s', '3-10s', '10-30s', '>30s'] as const;

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
                  <Tabla headers={['Fase', 'Jugadas', 'Graves', 'Errores', 'Imprecisiones', 'CP perdidos prom.']}>
                    {filas.map((f) => {
                      const n = f.n_moves ?? 0;
                      const fase = f.phase ?? 0;
                      return (
                        <tr key={fase} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                          <td className="py-1.5 pr-3">{NOMBRE_FASE[fase] ?? fase}</td>
                          <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
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
                  <Tabla headers={['Rango', 'Jugadas', 'Tasa de error', 'CP perdidos prom.']}>
                    {ORDEN_BUCKET.map((bucket) => {
                      const fila = filas.find((f) => f.time_bucket === bucket);
                      const n = fila?.n_moves ?? 0;
                      return (
                        <tr key={bucket} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                          <td className="py-1.5 pr-3">{bucket}</td>
                          <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
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
