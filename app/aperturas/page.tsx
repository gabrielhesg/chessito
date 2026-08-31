import { openingPerformance, analysisCoverage } from '@/lib/data';
import { Muestra, Panel, Tabla, Vacio, filaAtenuada, pct } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Pregunta 1: contra que aperturas pierde y con que color.
 *
 * El grupo "Sin resolver" se muestra a proposito: `v_opening_performance` usa LEFT JOIN, y si
 * ese grupo crece hay un bug en el cargador de aperturas. Con INNER JOIN seria invisible.
 */
export default async function AperturasPage() {
  const [filas, cobertura] = await Promise.all([openingPerformance(), analysisCoverage()]);

  const sinResolver = filas.filter((f) => f.opening_id === null).reduce((s, f) => s + (f.n ?? 0), 0);
  const total = filas.reduce((s, f) => s + (f.n ?? 0), 0);
  const analizadas = cobertura.reduce((s, c) => s + (c.n_analyzed ?? 0), 0);
  const totalPartidas = cobertura.reduce((s, c) => s + (c.n_games ?? 0), 0);

  const porColor = (color: 'white' | 'black') =>
    filas
      .filter((f) => f.my_color === color)
      .sort((a, b) => (a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0))
      .slice(0, 25);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Aperturas</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Ordenadas por la cota inferior de Wilson, de peor a mejor. Los cortes con n&lt;20 salen
          atenuados y no llevan recomendacion. La columna de divergencia y el ACPL se llenan en la
          Fase 3: por ahora hay {analizadas} de {totalPartidas} partidas analizadas.
        </p>
      </header>

      {sinResolver > 0 ? (
        <p className="rounded border border-[var(--color-aviso)] px-3 py-2 text-sm text-[var(--color-aviso)]">
          Sin resolver por EPD: {sinResolver} de {total} partidas (
          {total > 0 ? ((sinResolver / total) * 100).toFixed(2) : '0'}%). Si esto crece, hay un bug
          en el cargador de aperturas.
        </p>
      ) : null}

      {(['white', 'black'] as const).map((color) => (
        <Panel
          key={color}
          title={color === 'white' ? 'Con blancas' : 'Con negras'}
          subtitle="Peores primero"
        >
          {porColor(color).length === 0 ? (
            <Vacio>Sin datos todavia.</Vacio>
          ) : (
            <Tabla headers={['Apertura', 'ECO', 'Tipo', 'n', 'Rendimiento', 'Wilson', 'Divergencia']}>
              {porColor(color).map((f) => {
                const n = f.n ?? 0;
                return (
                  <tr
                    key={`${f.opening_id ?? 'null'}-${f.time_class}-${color}`}
                    className={`border-b border-[var(--color-borde)]/50 ${filaAtenuada(n)}`}
                  >
                    <td className="py-1.5 pr-3">{f.opening_name}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{f.eco ?? '—'}</td>
                    <td className="py-1.5 pr-3">{f.time_class}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      <Muestra n={n} />
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{pct(f.score_pct)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{pct(f.score_pct_lower)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {f.median_divergence_ply === null ? '—' : `ply ${Math.round(f.median_divergence_ply)}`}
                    </td>
                  </tr>
                );
              })}
            </Tabla>
          )}
        </Panel>
      ))}
    </div>
  );
}
