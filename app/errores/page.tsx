import { analysisCoverage, errorsByMoveTime, errorsByPhase, errorsDiagnostic } from '@/lib/data';
import {
  Ayuda,
  Badge,
  Clasificacion,
  EmptyState,
  Fila,
  Pagina,
  Panel,
  Tabla,
  Td,
  pct,
} from '@/components/ui';
import { BarrasH, type BarraH } from '@/components/charts/BarrasH';
import { BarrasV, type BarraV } from '@/components/charts/BarrasV';

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

  const totalPorClase = new Map<string, number>();
  for (const f of porFase) {
    const clase = f.time_class ?? '';
    totalPorClase.set(clase, (totalPorClase.get(clase) ?? 0) + (f.n_moves ?? 0));
  }
  const claseGrafico = [...totalPorClase.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  // La pregunta 4 en una sola imagen: tasa de error segun cuanto pensaste la jugada.
  const columnasTiempo: BarraV[] = ORDEN_BUCKET.map((bucket) => {
    const fila = porTiempo.find((f) => f.time_class === claseGrafico && f.time_bucket === bucket);
    const tasa = fila?.error_rate ?? null;
    return {
      etiqueta: bucket,
      valor: tasa === null ? null : tasa * 100,
      n: fila?.n_moves ?? 0,
      titulo: `${bucket} · ${fila?.n_moves ?? 0} jugadas · tasa de error ${((tasa ?? 0) * 100).toFixed(1)}%`,
    };
  });
  const maxTasa = Math.max(1, ...columnasTiempo.map((c) => c.valor ?? 0));

  // Errores graves por fase, normalizados por jugada: comparar conteos crudos entre fases
  // premiaria al medio juego solo por ser mas largo.
  const barrasFase: BarraH[] = porFase
    .filter((f) => f.time_class === claseGrafico)
    .sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0))
    .map((f) => {
      const jugadas = f.n_moves ?? 0;
      const graves = f.blunders ?? 0;
      const tasa = jugadas > 0 ? (graves / jugadas) * 100 : 0;
      return {
        etiqueta: NOMBRE_FASE[f.phase ?? 0] ?? String(f.phase),
        valor: tasa,
        texto: `${tasa.toFixed(1)}%`,
        atenuada: jugadas < 20,
        titulo: `${NOMBRE_FASE[f.phase ?? 0]} · ${graves} graves en ${jugadas} jugadas`,
      };
    });
  const maxFase = Math.max(1, ...barrasFase.map((b) => b.valor));

  return (
    <Pagina
      titulo="Errores"
      subtitulo={
        <>
          Basado en {analizadas.toLocaleString('es-CL')} de {totales.toLocaleString('es-CL')} partidas analizadas. Se excluyen las jugadas de libro y las de partidas ya decididas (win% del que mueve sobre 95 o bajo 5): jugar flojo en una partida ganada no cuenta como blunder.
        </>
      }
    >
      <div className="space-y-6">
        {diagnostico ? (
          <Panel
            title="Diagnóstico"
            subtitle="Hay partidas analizadas pero las tablas de abajo salen vacías. Este es el desglose de por qué."
          >
            <ul className="space-y-1 text-sm">
              <li>
                Jugadas con clasificación (de cualquiera):{' '}
                <strong className="tabular-nums">{diagnostico.conClasificacion}</strong>
              </li>
              <li>
                De esas, mías (<code className="text-tenue">is_mine</code>):{' '}
                <strong className="tabular-nums">{diagnostico.mias}</strong>
              </li>
              <li>
                De esas, fuera de libro (<code className="text-tenue">is_book = false</code>):{' '}
                <strong className="tabular-nums">{diagnostico.miasNoLibro}</strong>
              </li>
              <li>
                De esas, en partida no decidida (<code className="text-tenue">is_decided = false</code>):{' '}
                <strong className="tabular-nums">{diagnostico.miasNoLibroNoDecidida}</strong>
              </li>
            </ul>
            <p className="mt-2 text-xs text-tenue">
              El escalón donde el número se cae a 0 (o queda muy chico) es el filtro responsable.
            </p>
          </Panel>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel
            title="¿Los errores se concentran en las jugadas rápidas?"
            subtitle={`Tasa de error según cuánto pensaste la jugada${claseGrafico ? ` · ${claseGrafico}` : ''}`}
          >
            {porTiempo.length === 0 ? (
              <EmptyState
                titulo="Sin partidas analizadas todavía"
                detalle="El motor corre en GitHub Actions. Puedes dispararlo desde Salud."
              />
            ) : (
              <BarrasV datos={columnasTiempo} max={maxTasa} unidad="%" />
            )}
          </Panel>

          <Panel
            title="Errores graves por fase"
            subtitle={`Graves por cada 100 jugadas, no conteo crudo${claseGrafico ? ` · ${claseGrafico}` : ''}`}
          >
            {barrasFase.length === 0 ? (
              <EmptyState titulo="Sin partidas analizadas todavía" />
            ) : (
              <BarrasH datos={barrasFase} max={maxFase} />
            )}
          </Panel>
        </div>

        <Panel
          title="Detalle por fase"
          subtitle="Cuántas jugadas de cada tipo, en cada momento de la partida"
        >
          {porFase.length === 0 ? (
            <EmptyState
              titulo="Sin partidas analizadas todavía"
              detalle="Corre `pnpm analyze`, o espera al cron diario."
            />
          ) : (
            <div className="space-y-5">
              {clases.map((clase) => {
                const filas = porFase
                  .filter((f) => f.time_class === clase)
                  .sort((a, b) => (a.phase ?? 0) - (b.phase ?? 0));
                if (filas.length === 0) return null;
                return (
                  <div key={clase}>
                    <h3 className="mb-2 text-2xs uppercase tracking-wider text-tenue">{clase}</h3>
                    <Tabla
                      aligns={['text', 'num', 'num', 'num', 'num', 'num']}
                      headers={[
                        'Fase',
                        <span key="j" className="inline-flex items-center">
                          Jugadas
                          {AYUDA_JUGADAS}
                        </span>,
                        <Clasificacion key="g" valor={3} />,
                        <Clasificacion key="e" valor={2} />,
                        <Clasificacion key="i" valor={1} />,
                        <span key="cp" className="inline-flex items-center">
                          CP perdidos
                          <Ayuda alinear="der">
                            Centipeones perdidos en promedio por jugada. 100 centipeones equivalen a
                            un peón. Es el ACPL, la medida estándar de precisión.
                          </Ayuda>
                        </span>,
                      ]}
                    >
                      {filas.map((f) => {
                        const n = f.n_moves ?? 0;
                        const fase = f.phase ?? 0;
                        return (
                          <Fila key={fase} atenuada={n < 20}>
                            <Td>{NOMBRE_FASE[fase] ?? fase}</Td>
                            <Td num>{n.toLocaleString('es-CL')}</Td>
                            <Td num className="text-critico">{f.blunders ?? 0}</Td>
                            <Td num className="text-serio">{f.mistakes ?? 0}</Td>
                            <Td num className="text-aviso">{f.inaccuracies ?? 0}</Td>
                            <Td num>{f.avg_cp_loss?.toFixed(0) ?? '—'}</Td>
                          </Fila>
                        );
                      })}
                    </Tabla>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Detalle por tiempo de jugada" subtitle="El mismo corte, con los números exactos">
          {porTiempo.length === 0 ? (
            <EmptyState titulo="Sin partidas analizadas todavía" />
          ) : (
            <div className="space-y-5">
              {clases.map((clase) => {
                const filas = porTiempo.filter((f) => f.time_class === clase);
                if (filas.length === 0) return null;
                return (
                  <div key={clase}>
                    <h3 className="mb-2 text-2xs uppercase tracking-wider text-tenue">{clase}</h3>
                    <Tabla
                      aligns={['text', 'num', 'num', 'num']}
                      headers={[
                        'Rango',
                        <span key="j" className="inline-flex items-center">
                          Jugadas
                          {AYUDA_JUGADAS}
                        </span>,
                        'Tasa de error',
                        'CP perdidos',
                      ]}
                    >
                      {ORDEN_BUCKET.map((bucket) => {
                        const fila = filas.find((f) => f.time_bucket === bucket);
                        const n = fila?.n_moves ?? 0;
                        return (
                          <Fila key={bucket} atenuada={n < 20}>
                            <Td>
                              <Badge>{bucket}</Badge>
                            </Td>
                            <Td num>{n.toLocaleString('es-CL')}</Td>
                            <Td num>{pct(fila?.error_rate)}</Td>
                            <Td num>{fila?.avg_cp_loss?.toFixed(0) ?? '—'}</Td>
                          </Fila>
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
    </Pagina>
  );
}
