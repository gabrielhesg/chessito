import Link from 'next/link';
import {
  coberturaAnalisis,
  openingPerformance,
  repertorioRendimiento,
  respuestasDelRival,
  type OpeningPerformance,
} from '@/lib/data';
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

  // El repertorio DECLARADO. Va con `.catch` porque lo crea la migracion 0016: sin ella la
  // pagina sigue sirviendo lo de siempre en vez de caerse.
  const repertorio = await repertorioRendimiento().catch(() => []);
  const respuestas = await respuestasDelRival(20).catch(() => []);

  const entradas = repertorio.filter((r) => r.repertorio_id !== 'fuera' && (r.n ?? 0) > 0);
  const fuera = repertorio.filter((r) => r.repertorio_id === 'fuera');
  const nDentro = entradas.reduce((a, r) => a + (r.n ?? 0), 0);
  const nFuera = fuera.reduce((a, r) => a + (r.n ?? 0), 0);
  const nTotalRep = nDentro + nFuera;

  // La conclusion la escribe la app comparando los dos grupos, NO un texto fijo: la diferencia
  // real es de milesimas, y un parrafo que dijera "tu repertorio funciona y lo de afuera no"
  // seria un hallazgo inventado sobre algo que no existe.
  //
  // **La comparacion es DENTRO DE CADA COLOR, y eso no es un detalle.** Sumando los dos colores,
  // "dentro del repertorio" son casi todas sus partidas con negras (957 de 1.043) y "fuera" son
  // casi todas con blancas (795 de 1.038). Como con negras se rinde peor por razones que no
  // tienen nada que ver con el repertorio, el agregado mostraba una diferencia de 2,9 puntos que
  // era puro efecto del color. Comparar dentro de cada color lo elimina.
  const promedio = (filas: typeof repertorio): number | null => {
    const n = filas.reduce((a, r) => a + (r.n ?? 0), 0);
    return n > 0 ? filas.reduce((a, r) => a + (r.score_pct ?? 0) * (r.n ?? 0), 0) / n : null;
  };

  const porColorRepertorio = (['white', 'black'] as const).map((color) => {
    const dentro = entradas.filter((r) => r.my_color === color);
    const afuera = fuera.filter((r) => r.my_color === color);
    const a = promedio(dentro);
    const b = promedio(afuera);
    return {
      color,
      nDentro: dentro.reduce((x, r) => x + (r.n ?? 0), 0),
      nFuera: afuera.reduce((x, r) => x + (r.n ?? 0), 0),
      dentro: a,
      afuera: b,
      diferencia: a !== null && b !== null ? a - b : null,
    };
  }).filter((c) => c.nDentro >= 20 && c.nFuera >= 20);

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
        {nTotalRep > 0 ? (
          <Panel
            title={`Llegaste a tu repertorio en ${nDentro.toLocaleString('es-CL')} de ${nTotalRep.toLocaleString('es-CL')} partidas`}
            subtitle="Tu repertorio declarado, agrupado por las jugadas que lo definen y no por el nombre de la apertura"
          >
            <Tabla
              aligns={['text', 'text', 'num', 'num']}
              headers={['Línea', 'Color', 'Partidas', <span key="r">Rendimiento{AYUDA_RENDIMIENTO}</span>]}
            >
              {[...entradas, ...fuera].map((r) => (
                <Fila key={`${r.repertorio_id}-${r.my_color}`} atenuada={(r.n ?? 0) < 20}>
                  <Td>
                    {r.repertorio_id === 'fuera' ? (
                      <span className="text-tenue">No llegaste a tu repertorio</span>
                    ) : (
                      (r.nombre ?? r.repertorio_id)
                    )}
                  </Td>
                  <Td>{r.my_color === 'white' ? 'blancas' : 'negras'}</Td>
                  <Td num>{(r.n ?? 0).toLocaleString('es-CL')}</Td>
                  <Td num>
                    <Rendimiento pctValue={r.score_pct} wilson={r.score_pct_lower} n={r.n ?? 0} />
                  </Td>
                </Fila>
              ))}
            </Tabla>

            {porColorRepertorio.length > 0 ? (
              <div className="mt-3.5 space-y-2 text-sm leading-relaxed">
                {porColorRepertorio.map((c) => (
                  <p key={c.color}>
                    <strong>Con {c.color === 'white' ? 'blancas' : 'negras'}:</strong>{' '}
                    {(c.dentro! * 100).toFixed(1)}% dentro de tu repertorio ({c.nDentro}) contra{' '}
                    {(c.afuera! * 100).toFixed(1)}% fuera ({c.nFuera}).{' '}
                    {Math.abs(c.diferencia ?? 0) < 0.03 ? (
                      <span className="text-tenue">
                        Prácticamente lo mismo: llegar a tu línea preparada no te está dando
                        ventaja, así que el problema no es qué te juegan sino qué haces después.
                      </span>
                    ) : (c.diferencia ?? 0) > 0 ? (
                      <span className="text-tenue">
                        {((c.diferencia ?? 0) * 100).toFixed(1)} puntos mejor dentro: preparar las
                        respuestas que te sacan de él es trabajo con retorno medible.
                      </span>
                    ) : (
                      <span className="text-tenue">
                        {(Math.abs(c.diferencia ?? 0) * 100).toFixed(1)} puntos <strong>peor</strong>{' '}
                        dentro que fuera: vale la pena revisar si la línea que preparaste te acomoda.
                      </span>
                    )}
                  </p>
                ))}
                <p className="text-[12.5px] text-apagado">
                  La comparación va dentro de cada color a propósito. Sumando los dos, &ldquo;dentro
                  del repertorio&rdquo; serían casi todas tus partidas con negras y &ldquo;fuera&rdquo;
                  casi todas las de blancas, y la diferencia que aparecería sería del color, no del
                  repertorio.
                </p>
              </div>
            ) : null}
          </Panel>
        ) : null}

        {respuestas.length > 0 ? (
          <Panel
            title="Qué te juegan cuando te sacan del repertorio"
            subtitle="Solo las respuestas con 20 partidas o más, que son las que permiten una conclusión"
          >
            <Tabla
              aligns={['text', 'text', 'num', 'num']}
              headers={['Te jugaron', 'Con', 'Partidas', <span key="r2">Rendimiento{AYUDA_RENDIMIENTO}</span>]}
            >
              {respuestas.map((r) => (
                <Fila key={`${r.apertura}-${r.my_color}`}>
                  <Td className="max-w-[16rem] truncate">{r.apertura}</Td>
                  <Td>{r.my_color === 'white' ? 'blancas' : 'negras'}</Td>
                  <Td num>{(r.n ?? 0).toLocaleString('es-CL')}</Td>
                  <Td num>
                    <Rendimiento pctValue={r.score_pct} wilson={r.score_pct_lower} n={r.n ?? 0} />
                  </Td>
                </Fila>
              ))}
            </Tabla>
            <p className="mt-3 text-[12.5px] text-tenue">
              Cada fila de arriba es una semana de estudio perfectamente definida: son las
              posiciones que ya te aparecieron decenas de veces y para las que no tienes plan.
            </p>
          </Panel>
        ) : null}

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
