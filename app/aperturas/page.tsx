import Link from 'next/link';
import { openingPerformance, coberturaAnalisis, type OpeningPerformance } from '@/lib/data';
import {
  Ayuda,
  Badge,
  Fila,
  Pagina,
  Panel,
  Rendimiento,
  SortableTh,
  Tabla,
  Td,
  Vacio,
} from '@/components/ui';
import { BarrasH, type BarraH } from '@/components/charts/BarrasH';

export const dynamic = 'force-dynamic';

/** La misma clase que filtra /errores y /ritmo: el plan de entrenamiento es de rapida. */
const CLASE = 'rapid';

type SortKey = 'wilson' | 'n' | 'name';
const SORT_KEYS: SortKey[] = ['wilson', 'n', 'name'];
function esSortKey(value: string | undefined): value is SortKey {
  return SORT_KEYS.includes(value as SortKey);
}

const AYUDA_RENDIMIENTO = (
  <Ayuda alinear="der">
    El número grande es la cota inferior de Wilson: con pocas partidas el porcentaje bruto puede
    estar inflado por suerte, y Wilson lo corrige a la baja. Se usa para ordenar y comparar, no es
    tu porcentaje real de victorias. Debajo, el porcentaje bruto y el número de partidas (n).
  </Ayuda>
);

/**
 * Pregunta 1: contra que aperturas pierde y con que color.
 *
 * El grupo "Sin resolver" (opening_id null) aparece a proposito: `v_opening_performance` usa
 * LEFT JOIN, y si ese grupo crece hay un bug en el cargador de aperturas. El aviso de ese
 * chequeo vive en /salud, junto al resto de calidad de datos, no aca.
 */
export default async function AperturasPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const sort: SortKey = esSortKey(params.sort) ? params.sort : 'wilson';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';

  const [todas, cobertura] = await Promise.all([openingPerformance(), coberturaAnalisis()]);

  // Solo rapida, con el mismo argumento escrito que ya usaba /errores: el rendimiento de una
  // apertura en bala y en rapida no son la misma cantidad. El grafico mezclaba las tres clases
  // y la clase solo vivia en un `title`, que no abre con tap: por eso se veian dos filas
  // "Scandinavian Defens... 30%" que eran la misma apertura en clases distintas.
  const filas: OpeningPerformance[] = todas.filter((f) => f.time_class === CLASE);

  const deLaClase = cobertura.find((c) => c.time_class === CLASE);
  const analizadas = deLaClase?.n_analyzed ?? 0;
  const totalPartidas = deLaClase?.n_analizables ?? 0;

  const signo = dir === 'asc' ? 1 : -1;
  const comparar = (a: OpeningPerformance, b: OpeningPerformance): number => {
    if (sort === 'n') return signo * ((a.n ?? 0) - (b.n ?? 0));
    if (sort === 'name') return signo * (a.opening_name ?? '').localeCompare(b.opening_name ?? '');
    return signo * ((a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0));
  };

  const porColor = (color: 'white' | 'black') =>
    filas.filter((f) => f.my_color === color).sort(comparar).slice(0, 25);

  const link = (nextSort: string, nextDir: 'asc' | 'desc'): string =>
    `/aperturas?sort=${nextSort}&dir=${nextDir}`;

  // El grafico muestra las peores con muestra suficiente: es la respuesta a "contra que pierdo",
  // y una barra de n<20 en ese top seria justamente el hallazgo falso que la regla del proyecto
  // quiere evitar. La tabla completa queda abajo, con todo.
  const peores = (color: 'white' | 'black'): BarraH[] =>
    filas
      .filter((f) => f.my_color === color && (f.n ?? 0) >= 20)
      .sort((a, b) => (a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0))
      .slice(0, 8)
      .map((f) => ({
        etiqueta: f.opening_name ?? 'Sin resolver',
        valor: (f.score_pct_lower ?? 0) * 100,
        referencia: (f.score_pct ?? 0) * 100,
        texto: `${((f.score_pct_lower ?? 0) * 100).toFixed(0)}%`,
        titulo: `${f.opening_name} · ${f.time_class} · n=${f.n} · bruto ${((f.score_pct ?? 0) * 100).toFixed(1)}%`,
      }));

  return (
    <Pagina
      titulo="Aperturas"
      subtitulo={
        <>
          <strong className="text-tenue">Solo partidas de rápida.</strong> El rendimiento de una
          apertura en bala y en rápida no son la misma cantidad, y tu plan es de rápida. Usa la
          cota inferior de Wilson; bajo 20 partidas la fila sale atenuada y sin recomendación.{' '}
          {analizadas > 0 ? (
            <>
              La columna de divergencia sale del motor: {analizadas.toLocaleString('es-CL')} de{' '}
              {totalPartidas.toLocaleString('es-CL')} partidas de rápida analizadas.
            </>
          ) : (
            <>La columna de divergencia necesita el motor y todavía no hay partidas de rápida analizadas.</>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {(['white', 'black'] as const).map((color) => {
          const barras = peores(color);
          const tabla = porColor(color);
          return (
            <Panel
              key={color}
              title={color === 'white' ? 'Con blancas' : 'Con negras'}
              subtitle="Las peores primero. La marca fina sobre cada barra es el porcentaje bruto."
            >
              {tabla.length === 0 ? (
                <Vacio>Sin datos todavía.</Vacio>
              ) : (
                <div className="space-y-5">
                  {barras.length > 0 ? (
                    <BarrasH datos={barras} max={100} referencia={50} etiquetaReferencia="50%" />
                  ) : null}

                  <details className="group">
                    <summary className="cursor-pointer list-none text-xs text-tenue hover:text-texto">
                      <span className="group-open:hidden">▸ Ver la tabla completa</span>
                      <span className="hidden group-open:inline">▾ Ocultar la tabla</span>
                    </summary>
                    <div className="mt-3">
                      <Tabla
                        aligns={['text', 'text', 'text', 'num', 'num']}
                        headers={[
                          <SortableTh
                            key="name"
                            label="Apertura"
                            sortKey="name"
                            currentSort={sort}
                            currentDir={dir}
                            href={link}
                          />,
                          <span key="eco">
                            ECO
                            <Ayuda>
                              Código estándar de apertura (Encyclopaedia of Chess Openings). Chessito
                              no agrupa por este código porque mezcla líneas muy distintas — se
                              muestra solo como referencia.
                            </Ayuda>
                          </span>,
                          'Tipo',
                          <span key="rendimiento" className="inline-flex items-center">
                            <SortableTh
                              label="Rendimiento"
                              sortKey="wilson"
                              currentSort={sort}
                              currentDir={dir}
                              href={link}
                            />
                            {AYUDA_RENDIMIENTO}
                          </span>,
                          <span key="divergencia" className="inline-flex items-center">
                            Divergencia
                            <Ayuda alinear="der">
                              La jugada (ply) donde tu evaluación empezó a caer de forma sostenida en
                              esta apertura, según el motor. Más bajo = te desvías antes de la teoría.
                            </Ayuda>
                          </span>,
                        ]}
                      >
                        {tabla.map((f) => {
                          const n = f.n ?? 0;
                          return (
                            <Fila
                              key={`${f.opening_id ?? 'null'}-${f.time_class}-${color}`}
                              atenuada={n < 20}
                            >
                              <Td>{f.opening_name}</Td>
                              <Td className="tabular-nums text-tenue">{f.eco ?? '—'}</Td>
                              <Td>
                                <Badge>{f.time_class}</Badge>
                              </Td>
                              <Td num>
                                <Rendimiento pctValue={f.score_pct} wilson={f.score_pct_lower} n={n} />
                              </Td>
                              <Td num>
                                {f.median_divergence_ply === null
                                  ? '—'
                                  : `ply ${Math.round(f.median_divergence_ply)}`}
                              </Td>
                            </Fila>
                          );
                        })}
                      </Tabla>
                    </div>
                  </details>
                </div>
              )}
            </Panel>
          );
        })}

        <p className="text-xs text-tenue">
          El estado del cargador de aperturas (partidas sin resolver por EPD) está en{' '}
          <Link href="/salud" className="text-acento hover:underline">
            Salud
          </Link>
          .
        </p>
      </div>
    </Pagina>
  );
}
