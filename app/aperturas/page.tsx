import { openingPerformance, analysisCoverage } from '@/lib/data';
import { Ayuda, Panel, Rendimiento, SortableTh, Tabla, Vacio, filaAtenuada } from '@/components/ui';

export const dynamic = 'force-dynamic';

type SortKey = 'wilson' | 'n' | 'name';

const SORT_KEYS: SortKey[] = ['wilson', 'n', 'name'];

function esSortKey(value: string | undefined): value is SortKey {
  return SORT_KEYS.includes(value as SortKey);
}

/**
 * Pregunta 1: contra que aperturas pierde y con que color.
 *
 * El grupo "Sin resolver" (opening_id null) sigue apareciendo a proposito: `v_opening_performance`
 * usa LEFT JOIN, y si ese grupo crece hay un bug en el cargador de aperturas. Pero el aviso de
 * ese chequeo vive en /salud, junto con el resto de calidad de datos (v_data_quality), no aca:
 * esta pantalla responde "contra que pierdo", no "esta sano el pipeline".
 */
export default async function AperturasPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const sort: SortKey = esSortKey(params.sort) ? params.sort : 'wilson';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';

  const [filas, cobertura] = await Promise.all([openingPerformance(), analysisCoverage()]);

  const analizadas = cobertura.reduce((s, c) => s + (c.n_analyzed ?? 0), 0);
  const totalPartidas = cobertura.reduce((s, c) => s + (c.n_games ?? 0), 0);

  const signo = dir === 'asc' ? 1 : -1;
  const comparar = (
    a: (typeof filas)[number],
    b: (typeof filas)[number],
  ): number => {
    if (sort === 'n') return signo * ((a.n ?? 0) - (b.n ?? 0));
    if (sort === 'name') return signo * (a.opening_name ?? '').localeCompare(b.opening_name ?? '');
    return signo * ((a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0));
  };

  const porColor = (color: 'white' | 'black') =>
    filas
      .filter((f) => f.my_color === color)
      .sort(comparar)
      .slice(0, 25);

  const link = (nextSort: string, nextDir: 'asc' | 'desc'): string => `/aperturas?sort=${nextSort}&dir=${nextDir}`;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Aperturas</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          Ordenadas por la cota inferior de Wilson, de peor a mejor. Los cortes con n&lt;20 salen
          atenuados y no llevan recomendacion. La columna de divergencia y el ACPL se llenan en la
          Fase 3: por ahora hay {analizadas} de {totalPartidas} partidas analizadas. El estado del
          cargador de aperturas (partidas sin resolver por EPD) esta en <a className="underline" href="/salud">Salud</a>.
        </p>
      </header>

      {(['white', 'black'] as const).map((color) => (
        <Panel
          key={color}
          title={color === 'white' ? 'Con blancas' : 'Con negras'}
          subtitle="Peores primero. Click en un encabezado para reordenar."
        >
          {porColor(color).length === 0 ? (
            <Vacio>Sin datos todavia.</Vacio>
          ) : (
            <Tabla
              headers={[
                <SortableTh key="name" label="Apertura" sortKey="name" currentSort={sort} currentDir={dir} href={link} />,
                <span key="eco">
                  ECO
                  <Ayuda>
                    Código estándar de apertura (Encyclopaedia of Chess Openings). Chessito no
                    agrupa por este código porque mezcla líneas muy distintas — se muestra solo
                    como referencia.
                  </Ayuda>
                </span>,
                'Tipo',
                <span key="rendimiento" className="inline-flex items-center">
                  <SortableTh label="Rendimiento" sortKey="wilson" currentSort={sort} currentDir={dir} href={link} />
                  <Ayuda>
                    El número grande es la cota inferior de Wilson: con pocas partidas el
                    porcentaje bruto puede estar inflado por suerte, y Wilson lo corrige a la
                    baja. Se usa para ordenar y comparar, no es tu porcentaje real de victorias.
                    Debajo, el porcentaje bruto y el número de partidas de la muestra (n).
                  </Ayuda>
                </span>,
                <span key="divergencia">
                  Divergencia
                  <Ayuda>
                    La jugada (ply) donde tu evaluación empezó a caer de forma sostenida en esta
                    apertura, según el motor. Más bajo = te desvías antes de la teoría.
                  </Ayuda>
                </span>,
              ]}
            >
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
                    <td className="py-1.5 pr-3">
                      <Rendimiento pctValue={f.score_pct} wilson={f.score_pct_lower} n={n} />
                    </td>
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
