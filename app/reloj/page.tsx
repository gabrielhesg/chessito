import { moveTimeByPhase, moveTimeByPly, moveTimeDistribution, timeoutMoment } from '@/lib/data';
import { Ayuda, Badge, EmptyState, Fila, PageHeader, Panel, Stat, Tabla, Td, pct } from '@/components/ui';
import { BarrasH, type BarraH } from '@/components/charts/BarrasH';
import { BarrasV, type BarraV } from '@/components/charts/BarrasV';

export const dynamic = 'force-dynamic';

const NOMBRE_FASE: Record<number, string> = { 0: 'Apertura', 1: 'Medio juego', 2: 'Final' };
const ORDEN_BUCKET = ['<3s', '3-10s', '10-30s', '>30s'] as const;

function segundos(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

const AYUDA_N = (
  <Ayuda>
    Número de jugadas o partidas en este corte. Bajo 20 la fila sale atenuada: con pocas
    observaciones el patrón puede ser casualidad.
  </Ayuda>
);
const COL_N = (
  <span key="n" className="inline-flex items-center">
    n{AYUDA_N}
  </span>
);

/**
 * Pregunta 4: uso del reloj. Sale de `moves.move_time_ms` y `moves.phase`, poblados por
 * `pnpm moves:extract`; la clasificacion de si esas jugadas rapidas fueron buenas o malas la
 * cruza /errores.
 */
export default async function RelojPage() {
  const [porJugada, porFase, distribucion, timeouts] = await Promise.all([
    moveTimeByPly(),
    moveTimeByPhase(),
    moveTimeDistribution(),
    timeoutMoment(),
  ]);

  const totalTimeouts = timeouts.reduce((acc, t) => acc + (t.n_games ?? 0), 0);

  // "Donde piensa": tiempo promedio jugada a jugada. Es la forma de la curva lo que importa,
  // no el valor exacto de cada ply, asi que una columna por ply se lee mejor que 60 filas.
  const columnasPly: BarraV[] = porJugada
    .sort((a, b) => (a.ply ?? 0) - (b.ply ?? 0))
    .map((p) => ({
      etiqueta: String(p.ply),
      valor: p.avg_move_time_ms === null ? null : p.avg_move_time_ms / 1000,
      n: p.n ?? 0,
      titulo: `Ply ${p.ply} · n=${p.n} · promedio ${segundos(p.avg_move_time_ms)} · mediana ${segundos(p.median_move_time_ms)}`,
    }));
  const maxPly = Math.max(1, ...columnasPly.map((c) => c.valor ?? 0));

  const totalDistribucion = distribucion.reduce((acc, d) => acc + (d.n ?? 0), 0);
  const barrasDistribucion: BarraH[] = ORDEN_BUCKET.map((bucket) => {
    const n = distribucion.filter((d) => d.time_bucket === bucket).reduce((acc, d) => acc + (d.n ?? 0), 0);
    const proporcion = totalDistribucion > 0 ? (n / totalDistribucion) * 100 : 0;
    return {
      etiqueta: bucket,
      valor: proporcion,
      texto: `${proporcion.toFixed(1)}%`,
      titulo: `${bucket} · ${n.toLocaleString('es-CL')} jugadas`,
    };
  });

  const bajo3s = barrasDistribucion.find((b) => b.etiqueta === '<3s')?.valor ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader titulo="Reloj">
        Dónde piensas y dónde te apuras. El cruce con la calidad de esas jugadas — si las rápidas
        son además las malas — está en Errores.
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          etiqueta="Jugadas bajo 3 segundos"
          valor={`${bajo3s.toFixed(1)}%`}
          detalle={`de ${totalDistribucion.toLocaleString('es-CL')} jugadas con reloj`}
          tono={bajo3s > 50 ? 'critico' : undefined}
        />
        <Stat
          etiqueta="Derrotas por tiempo"
          valor={totalTimeouts.toLocaleString('es-CL')}
          detalle="partidas perdidas con el reloj en cero"
        />
        <Stat
          etiqueta="Jugadas medidas"
          valor={porJugada.reduce((acc, p) => acc + (p.n ?? 0), 0).toLocaleString('es-CL')}
          detalle="hasta el ply 60"
        />
      </div>

      <Panel
        title="Dónde se va el tiempo"
        subtitle="Tiempo promedio por número de jugada (ply), hasta el 60"
      >
        {porJugada.length === 0 ? (
          <EmptyState
            titulo="Sin jugadas extraídas todavía"
            detalle="Corre `pnpm moves:extract` para poblar la tabla de jugadas desde el PGN."
          />
        ) : (
          <div className="space-y-5">
            <BarrasV datos={columnasPly} max={maxPly} unidad="s" alto="h-32" cadaCuantasEtiquetas={5} />
            <p className="text-2xs text-apagado">Segundos promedio por jugada · eje x: ply</p>
            <details className="group">
              <summary className="cursor-pointer list-none text-xs text-tenue hover:text-texto">
                <span className="group-open:hidden">▸ Ver la tabla completa</span>
                <span className="hidden group-open:inline">▾ Ocultar la tabla</span>
              </summary>
              <div className="mt-3">
                <Tabla aligns={['num', 'num', 'num', 'num']} headers={['Ply', COL_N, 'Promedio', 'Mediana']}>
                  {porJugada.map((p) => {
                    const n = p.n ?? 0;
                    return (
                      <Fila key={p.ply} atenuada={n < 20}>
                        <Td num>{p.ply}</Td>
                        <Td num>{n.toLocaleString('es-CL')}</Td>
                        <Td num>{segundos(p.avg_move_time_ms)}</Td>
                        <Td num>{segundos(p.median_move_time_ms)}</Td>
                      </Fila>
                    );
                  })}
                </Tabla>
              </div>
            </details>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Distribución de tiempos" subtitle="Qué proporción de tus jugadas cae en cada rango">
          {distribucion.length === 0 ? (
            <EmptyState titulo="Sin jugadas extraídas todavía" />
          ) : (
            <BarrasH datos={barrasDistribucion} max={100} />
          )}
        </Panel>

        <Panel title="Por fase" subtitle="Porcentaje de jugadas bajo 3 segundos, con la cota de Wilson">
          {porFase.length === 0 ? (
            <EmptyState titulo="Sin jugadas extraídas todavía" />
          ) : (
            <Tabla
              aligns={['text', 'num', 'num', 'num']}
              headers={['Fase', COL_N, 'Tiempo promedio', '% bajo 3s']}
            >
              {porFase.map((f) => {
                const n = f.n ?? 0;
                const fase = f.phase ?? 0;
                return (
                  <Fila key={fase} atenuada={n < 20}>
                    <Td>{NOMBRE_FASE[fase] ?? fase}</Td>
                    <Td num>{n.toLocaleString('es-CL')}</Td>
                    <Td num>{segundos(f.avg_move_time_ms)}</Td>
                    <Td num>{pct(f.pct_under_3s_lower)}</Td>
                  </Fila>
                );
              })}
            </Tabla>
          )}
        </Panel>
      </div>

      <Panel
        title="Se te acaba el tiempo"
        subtitle="En qué fase estabas jugando en las derrotas por tiempo"
      >
        {timeouts.length === 0 ? (
          <EmptyState titulo="Sin derrotas por tiempo registradas todavía" />
        ) : (
          <Tabla
            aligns={['text', 'num', 'num']}
            headers={['Fase', COL_N, 'Ply promedio de la última jugada']}
          >
            {timeouts.map((t) => {
              const n = t.n_games ?? 0;
              const fase = t.phase ?? 0;
              return (
                <Fila key={fase} atenuada={n < 20}>
                  <Td>
                    <Badge tono={n > 0 ? 'critico' : 'neutro'}>{NOMBRE_FASE[fase] ?? fase}</Badge>
                  </Td>
                  <Td num>{n.toLocaleString('es-CL')}</Td>
                  <Td num>{t.avg_ply ?? '—'}</Td>
                </Fila>
              );
            })}
          </Tabla>
        )}
      </Panel>
    </div>
  );
}
