import Link from 'next/link';
import {
  coberturaAnalisis,
  conversionDeVentaja,
  errorsByMoveTime,
  errorsByPhase,
  errorsDiagnostic,
  regalosMensual,
  ventajasNoConvertidas,
} from '@/lib/data';
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
/** La unica clase de tiempo que entra al analisis de errores. Ver el comentario de abajo. */
const CLASE = 'rapid';

export default async function ErroresPage() {
  const [cobertura, porFaseTodas, porTiempoTodas] = await Promise.all([
    coberturaAnalisis(),
    errorsByPhase(),
    errorsByMoveTime(),
  ]);

  // Los dos paneles de la Fase 3 de la revision van con `.catch`: los crea la migracion 0015 y,
  // como son diagnostico y no el tema de la pagina, no pueden tumbarla si no esta aplicada.
  const [conversion, sinConvertir, regalos] = await Promise.all([
    conversionDeVentaja().catch(() => null),
    ventajasNoConvertidas(6).catch(() => []),
    regalosMensual().catch(() => []),
  ]);
  const regalosRecientes = regalos.slice(-6);
  const totalRegalos = regalosRecientes.reduce((a, r) => a + (r.n ?? 0), 0);
  const totalAprovechados = regalosRecientes.reduce((a, r) => a + (r.aprovechados ?? 0), 0);

  // El analisis cuenta SOLO rapida. En bala y en blitz no hay tiempo para calcular: un error ahi
  // dice mas del reloj que de lo que entiendes, y mezclarlo desplaza la conclusion justo en la
  // pregunta que esta pagina existe para responder. Los ejercicios del entrenador SI se siguen
  // construyendo desde todas las partidas: una posicion perdida en blitz entrena igual.
  const porFase = porFaseTodas.filter((f) => f.time_class === CLASE);
  const porTiempo = porTiempoTodas.filter((f) => f.time_class === CLASE);

  // La cobertura se calcula con el MISMO corte que alimenta los graficos. Antes sumaba TODAS
  // las clases y declaraba "1.782 de 10.106" en una pagina que solo muestra rapida: el numero
  // honesto era 108 de 2.588, o sea sobredeclaraba la base 16 veces. Una pagina nunca declara
  // una base que no uso.
  const deLaClase = cobertura.find((c) => c.time_class === CLASE);
  const analizadas = deLaClase?.n_analyzed ?? 0;
  // El denominador honesto es lo ANALIZABLE, no el total: lo excluido por un motivo (variantes,
  // correspondencia, daily) nunca va a entrar al motor y no pertenece a la cuenta.
  const totales = deLaClase?.n_analizables ?? 0;
  const enCola = deLaClase?.n_pending ?? 0;
  const clases = [CLASE];

  // Hay partidas analizadas pero las tablas de abajo salen vacias: algo esta filtrando todas
  // las filas (is_mine, is_book o is_decided). En vez de pedir una consulta a mano, la propia
  // app se responde con el mismo desglose.
  const diagnostico = analizadas > 0 && porFase.length === 0 ? await errorsDiagnostic() : null;

  const claseGrafico = CLASE;

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

  // La conclusion la escribe la app, derivada de las filas. La pregunta 4 del proyecto
  // ("¿los errores vienen de jugar rapido?") ya esta respondida por los datos y hasta ahora la
  // pagina dibujaba la escalera y se callaba: el titulo era la pregunta y la respuesta no
  // aparecia en ningun lado.
  const tasaDe = (bucket: string): number | null => {
    const f = porTiempo.find((x) => x.time_bucket === bucket);
    return f?.error_rate === null || f?.error_rate === undefined ? null : f.error_rate * 100;
  };
  const rapidas = tasaDe('<3s');
  const lentas = tasaDe('>30s');
  const nRapidas = porTiempo.find((x) => x.time_bucket === '<3s')?.n_moves ?? 0;
  const nLentas = porTiempo.find((x) => x.time_bucket === '>30s')?.n_moves ?? 0;
  const hayRespuestaDeTiempo = rapidas !== null && lentas !== null && nRapidas >= 20 && nLentas >= 20;
  const errorEnLasLentas = hayRespuestaDeTiempo && lentas > rapidas;

  const tituloTiempo = !hayRespuestaDeTiempo
    ? '¿Los errores se concentran en las jugadas rápidas?'
    : errorEnLasLentas
      ? 'Tus errores están donde más piensas, no donde vas rápido'
      : 'Tus errores sí se concentran en las jugadas rápidas';

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
          <strong className="text-tenue">Solo partidas de rápida.</strong> En bala y en blitz no
          hay tiempo para calcular: un error ahí dice más del reloj que de lo que entiendes, y
          mezclarlo mueve la conclusión justo en la pregunta que esta página existe para responder.
          Basado en {analizadas.toLocaleString('es-CL')} de {totales.toLocaleString('es-CL')} partidas de rápida analizadas
          {enCola > 0 ? `, con ${enCola.toLocaleString('es-CL')} en cola` : ''}. Se excluyen las jugadas de libro y las de partidas ya decididas (win% del que mueve sobre 95 o bajo 5): jugar flojo en una partida ganada no cuenta como blunder.
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
            title={tituloTiempo}
            subtitle="¿Los errores se concentran en las jugadas rápidas? · Tasa de error según cuánto pensaste la jugada"
          >
            {porTiempo.length === 0 ? (
              <EmptyState
                titulo="Sin partidas analizadas todavía"
                detalle="El motor corre en GitHub Actions. Puedes dispararlo desde Salud."
              />
            ) : (
              <>
                <BarrasV datos={columnasTiempo} max={maxTasa} unidad="%" />
                {hayRespuestaDeTiempo ? (
                  <div className="mt-4 border-t border-borde pt-3.5">
                    <p className="text-[13.5px] leading-relaxed">
                      <strong>{errorEnLasLentas ? 'No.' : 'Sí.'}</strong> Fallas el{' '}
                      <strong className="tabular-nums">{rapidas.toFixed(1)}%</strong> de las jugadas
                      instantáneas ({nRapidas.toLocaleString('es-CL')} jugadas) y el{' '}
                      <strong className="tabular-nums">{lentas.toFixed(1)}%</strong> de las que
                      piensas más de 30 segundos ({nLentas.toLocaleString('es-CL')} jugadas).
                      {errorEnLasLentas
                        ? ' Reconoces los momentos críticos —por eso les das tiempo— y no los resuelves.'
                        : ' El reloj sí es parte del problema.'}
                    </p>
                    <p className="mt-2 text-[11.5px] leading-relaxed text-apagado">
                      Pensar mucho también correlaciona con posiciones difíciles, así que esto no
                      prueba que pensar te perjudique. Lo que sí hace es descartar que el apuro sea
                      la causa.
                    </p>
                  </div>
                ) : null}
              </>
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

        {conversion !== null && (conversion.n ?? 0) > 0 ? (
          <Panel
            title={
              (conversion.n ?? 0) < 20
                ? 'Cuando estuviste mejor'
                : `De cada 10 partidas que tuviste ganadas, cerraste ${Math.round(((conversion.ganadas ?? 0) / (conversion.n ?? 1)) * 10)}`
            }
            subtitle="Partidas de rápida donde la evaluación llegó a +200 a tu favor fuera del libro, las últimas 30"
          >
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="text-[26px] font-semibold tabular-nums">
                {conversion.ganadas ?? 0}
                <span className="text-[15px] font-normal text-apagado"> de {conversion.n}</span>
              </p>
              <p className="text-[12.5px] text-tenue">
                {conversion.tablas ?? 0} en tablas · {conversion.perdidas ?? 0} perdidas
              </p>
            </div>
            <p className="mt-3 text-sm leading-relaxed">
              {(conversion.n ?? 0) < 20 ? (
                <>
                  Con {conversion.n} partidas todavía no hay conclusión: el umbral son 20. El
                  número está acá para que se vea crecer.
                </>
              ) : (
                <>
                  Acá el error no fue táctico: la posición estaba bien y algo pasó después. Es la
                  traducción medible de &ldquo;no sé qué hacer en el medio juego&rdquo;, y es el
                  mejor material de revisión que tienes — mejor que cualquier blunder suelto.
                </>
              )}
            </p>

            {sinConvertir.length > 0 ? (
              <ul className="mt-4 flex list-none flex-col gap-1.5 p-0">
                {sinConvertir.map((p) => (
                  <li key={p.game_id} className="flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
                    <span className="min-w-0 truncate text-tenue">
                      contra {p.opp_username} · llegaste a{' '}
                      <span className="tabular-nums text-texto">
                        +{(((p.ventaja_maxima ?? 0) / 100)).toFixed(1)}
                      </span>
                      {p.ply_perdida !== null ? (
                        <> y la soltaste en la jugada {Math.ceil((p.ply_perdida ?? 0) / 2)}</>
                      ) : null}
                    </span>
                    <Link
                      href={p.ply_perdida === null ? `/partida/${p.game_id}` : `/partida/${p.game_id}?ply=${p.ply_perdida}`}
                      className="shrink-0 text-acento hover:underline"
                    >
                      Ver
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </Panel>
        ) : null}

        {totalRegalos > 0 ? (
          <Panel
            title={`Tu rival te regaló ${totalRegalos.toLocaleString('es-CL')} veces y cobraste ${totalAprovechados.toLocaleString('es-CL')}`}
            subtitle="Errores graves del rival en rápida, y si tu jugada siguiente los devolvió. Últimos meses con datos"
          >
            <Tabla
              aligns={['text', 'num', 'num', 'num']}
              headers={['Mes', 'Regalos', 'Cobrados', '% (Wilson)']}
            >
              {regalosRecientes.map((m) => (
                <Fila key={m.month_local} atenuada={(m.n ?? 0) < 20}>
                  <Td>{m.month_local}</Td>
                  <Td num>{(m.n ?? 0).toLocaleString('es-CL')}</Td>
                  <Td num>{(m.aprovechados ?? 0).toLocaleString('es-CL')}</Td>
                  <Td num>{pct(m.aprovechamiento_lower)}</Td>
                </Fila>
              ))}
            </Tabla>
            <p className="mt-3 text-[12.5px] text-tenue">
              &ldquo;Cobrado&rdquo; no significa que ganaras la partida: significa que tu jugada
              siguiente no devolvió la ventaja. Es el espejo de tu propia tasa de error, y a tu
              nivel es más accionable — las partidas se deciden tanto por lo que el rival regala
              como por lo que tú entregas.
            </p>
          </Panel>
        ) : null}
      </div>
    </Pagina>
  );
}
