import { afterResult, byHour, bySessionIndex } from '@/lib/data';
import { Muestra, Panel, Tabla, Vacio, filaAtenuada, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

/** Pregunta 2: tilt y fatiga. Hora local de Santiago, numero de partida en la sesion, y que
 * pasa despues de una derrota. Las vistas ya vienen en `America/Santiago`. */
export default async function RitmoPage() {
  const [horas, sesion, despues] = await Promise.all([byHour(), bySessionIndex(), afterResult()]);

  const clases = [...new Set(horas.map((h) => h.time_class).filter((c): c is string => c !== null))].sort();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Ritmo</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Horario de Santiago. Toda fila muestra su n y las de menos de 20 partidas salen
          atenuadas: un corte sobre 12 partidas es ruido.
        </p>
      </header>

      <Panel title="Por hora del dia" subtitle="Rendimiento segun la hora local a la que termino la partida">
        {horas.length === 0 ? (
          <Vacio>Sin datos todavia.</Vacio>
        ) : (
          <Tabla headers={['Hora', 'Tipo', 'n', 'Rendimiento', 'Wilson']}>
            {horas.map((h) => {
              const n = h.n ?? 0;
              return (
                <tr key={`${h.time_class}-${h.hour_local}`} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                  <td className="py-1.5 pr-3 tabular-nums">{String(h.hour_local).padStart(2, '0')}:00</td>
                  <td className="py-1.5 pr-3">{h.time_class}</td>
                  <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(h.score_pct)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(h.score_pct_lower)}</td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </Panel>

      <Panel title="Fatiga" subtitle="Rendimiento segun cuantas partidas lleva en la sesion (6 = sexta o mas)">
        {sesion.length === 0 ? (
          <Vacio>Sin datos todavia.</Vacio>
        ) : (
          <Tabla headers={['Partida de la sesion', 'Tipo', 'n', 'Rendimiento', 'Wilson']}>
            {sesion.map((s) => {
              const n = s.n ?? 0;
              return (
                <tr key={`${s.time_class}-${s.game_index_capped}`} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                  <td className="py-1.5 pr-3 tabular-nums">
                    {s.game_index_capped === 6 ? '6 o mas' : s.game_index_capped}
                  </td>
                  <td className="py-1.5 pr-3">{s.time_class}</td>
                  <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(s.score_pct)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{pct(s.score_pct_lower)}</td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </Panel>

      <Panel title="Tilt" subtitle="Como le va en la partida siguiente segun como termino la anterior">
        {despues.length === 0 ? (
          <Vacio>Sin datos todavia.</Vacio>
        ) : (
          <div className="space-y-4">
            {clases.map((clase) => {
              const filas = despues.filter((d) => d.time_class === clase);
              if (filas.length === 0) return null;
              return (
                <div key={clase}>
                  <h3 className="mb-1 text-xs uppercase tracking-wide text-[var(--color-tenue)]">{clase}</h3>
                  <Tabla headers={['Partida anterior', 'n', 'Rendimiento', 'Wilson']}>
                    {filas.map((d) => {
                      const n = d.n ?? 0;
                      return (
                        <tr key={`${clase}-${d.prev_result}`} className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}>
                          <td className="py-1.5 pr-3">
                            {d.prev_result === 'win' ? 'ganada' : d.prev_result === 'loss' ? 'perdida' : 'tablas'}
                          </td>
                          <td className="py-1.5 pr-3 tabular-nums"><Muestra n={n} /></td>
                          <td className="py-1.5 pr-3 tabular-nums">{pct(d.score_pct)}</td>
                          <td className="py-1.5 pr-3 tabular-nums">{pct(d.score_pct_lower)}</td>
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
