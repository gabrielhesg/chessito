import { afterResult, byHour, bySessionIndex } from '@/lib/data';
import { Ayuda, Badge, Fila, Pagina, Panel, Rendimiento, Tabla, Td, Vacio } from '@/components/ui';
import { BarrasV, type BarraV } from '@/components/charts/BarrasV';

export const dynamic = 'force-dynamic';

/**
 * La unica clase de tiempo que entra a esta pagina, por la misma razon que en `/errores`: el
 * plan de entrenamiento es de rapida. El grafico se elegia antes por VOLUMEN, y como el
 * historico tiene 5.660 partidas de blitz contra 2.588 de rapida, las 24 columnas que se veian
 * eran de blitz — el formato que el plan pide abandonar.
 */
const CLASE = 'rapid';

/** Bajo este `n` un corte no se comenta, solo se muestra atenuado. Regla del proyecto. */
const N_MINIMO = 20;

const AYUDA_RENDIMIENTO = (
  <Ayuda alinear="der">
    El número grande es la cota inferior de Wilson: corrige a la baja el porcentaje bruto cuando
    la muestra es chica, para que no parezca mejor o peor de lo que es por casualidad. Debajo, el
    porcentaje bruto y n (número de partidas de este corte).
  </Ayuda>
);

/** Un corte con lo necesario para decidir si se distingue de los demas o se solapa con ellos. */
type Corte = { etiqueta: string; n: number; wilson: number; bruto: number };

/**
 * ¿Los dos extremos de un conjunto de cortes se distinguen del ruido?
 *
 * Los intervalos tienen que NO solaparse: la cota inferior del mejor corte por encima de la cota
 * SUPERIOR del peor. Las vistas solo exponen `score_pct_lower`, asi que la superior se aproxima
 * reflejando el ancho sobre el bruto (`2*bruto - wilson`), que para una Wilson de estos tamanos
 * de muestra es una aproximacion razonable y, sobre todo, conservadora.
 *
 * Comparar contra el bruto pelado no alcanza, y no es teorico: con ese criterio el panel de
 * fatiga anunciaba "rindes peor en la 4ª partida (44%) que en la 5ª (51%)" por 0,4 puntos de
 * diferencia entre la cota del mejor y el bruto del peor — el hallazgo falso exacto que el
 * umbral de 20 del proyecto existe para evitar, colandose por el otro lado.
 *
 * Si no se distinguen, la respuesta es "no hay efecto", que es un resultado y no un fracaso.
 */
function hayEfecto(cortes: Corte[]): { hay: boolean; mejor: Corte; peor: Corte } | null {
  const conMuestra = cortes.filter((c) => c.n >= N_MINIMO);
  if (conMuestra.length < 2) return null;
  const ordenados = [...conMuestra].sort((a, b) => a.wilson - b.wilson);
  const peor = ordenados[0];
  const mejor = ordenados[ordenados.length - 1];
  if (!peor || !mejor) return null;
  const cotaSuperiorDelPeor = 2 * peor.bruto - peor.wilson;
  return { hay: mejor.wilson > cotaSuperiorDelPeor, mejor, peor };
}

function Conclusion({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-borde pt-3.5 text-[13.5px] leading-relaxed">{children}</div>;
}

/**
 * Pregunta 2: tilt y fatiga. Hora local de Santiago, numero de partida en la sesion, y que pasa
 * despues de una derrota. Las vistas ya vienen en `America/Santiago`.
 *
 * Todo panel que se titula con una pregunta cierra con su respuesta, derivada del dato y con su
 * `n`. Dos de los tres cortes de esta pagina miden EFECTO NULO sobre casi mil partidas por
 * brazo, y hasta la revision integral la pagina dibujaba tres graficos planos sin decirlo: seis
 * barras que difieren en dos puntos porcentuales se leen como una tendencia si nadie aclara que
 * no lo son.
 */
export default async function RitmoPage() {
  const [horas, sesion, despues] = await Promise.all([byHour(), bySessionIndex(), afterResult()]);

  const horasClase = horas.filter((h) => h.time_class === CLASE);
  const sesionClase = sesion.filter((s) => s.time_class === CLASE);
  const despuesClase = despues.filter((d) => d.time_class === CLASE);

  const columnasHora: BarraV[] = Array.from({ length: 24 }, (_, hora) => {
    const fila = horasClase.find((h) => h.hour_local === hora);
    const n = fila?.n ?? 0;
    const wilson = fila?.score_pct_lower ?? null;
    return {
      etiqueta: String(hora).padStart(2, '0'),
      valor: wilson === null ? null : wilson * 100,
      n,
      titulo:
        n === 0
          ? `${String(hora).padStart(2, '0')}:00 · sin partidas`
          : `${String(hora).padStart(2, '0')}:00 · n=${n} · Wilson ${((wilson ?? 0) * 100).toFixed(1)}%`,
    };
  });

  // El eje NO va de 0 a 100. Todos los datos viven entre 40% y 62%, asi que con el eje completo
  // las 24 columnas salen practicamente de la misma altura y el grafico no dice nada. Se acota al
  // rango real con un margen, y el 50% queda como linea de referencia.
  const valoresHora = columnasHora.flatMap((c) => (c.valor === null ? [] : [c.valor]));
  const maxEje = Math.min(100, Math.ceil(Math.max(50, ...valoresHora) / 5) * 5 + 5);

  const columnasSesion: BarraV[] = [...sesionClase]
    .sort((a, b) => (a.game_index_capped ?? 0) - (b.game_index_capped ?? 0))
    .map((s) => {
      const wilson = s.score_pct_lower ?? null;
      return {
        etiqueta: s.game_index_capped === 6 ? '6+' : String(s.game_index_capped ?? ''),
        valor: wilson === null ? null : wilson * 100,
        n: s.n ?? 0,
        titulo: `Partida ${s.game_index_capped} de la sesión · n=${s.n} · Wilson ${((wilson ?? 0) * 100).toFixed(1)}%`,
      };
    });

  const cortesHora: Corte[] = horasClase.map((h) => ({
    etiqueta: `${String(h.hour_local).padStart(2, '0')}:00`,
    n: h.n ?? 0,
    wilson: (h.score_pct_lower ?? 0) * 100,
    bruto: (h.score_pct ?? 0) * 100,
  }));
  const cortesSesion: Corte[] = sesionClase.map((s) => ({
    etiqueta: s.game_index_capped === 6 ? 'la sexta o más' : `la ${s.game_index_capped}ª`,
    n: s.n ?? 0,
    wilson: (s.score_pct_lower ?? 0) * 100,
    bruto: (s.score_pct ?? 0) * 100,
  }));
  const cortesTilt: Corte[] = despuesClase.map((d) => ({
    etiqueta:
      d.prev_result === 'win' ? 'tras ganar' : d.prev_result === 'loss' ? 'tras perder' : 'tras tablas',
    n: d.n ?? 0,
    wilson: (d.score_pct_lower ?? 0) * 100,
    bruto: (d.score_pct ?? 0) * 100,
  }));

  const efectoHora = hayEfecto(cortesHora);
  const efectoSesion = hayEfecto(cortesSesion);
  const efectoTilt = hayEfecto(cortesTilt);
  const partidasTilt = cortesTilt.reduce((suma, c) => suma + c.n, 0);

  return (
    <Pagina
      titulo="Ritmo"
      subtitulo={
        <>
          <strong className="text-tenue">Solo partidas de rápida</strong>, en horario de Santiago:
          es el formato de tu plan, y mezclar bala o blitz compararía cosas distintas. Las columnas
          con menos de {N_MINIMO} partidas salen atenuadas. Cada panel termina con su conclusión, y
          cuando el dato dice que no hay efecto, eso es lo que dice.
        </>
      }
    >
      <div className="space-y-6">
        <Panel
          title={efectoHora?.hay ? `Juegas peor a las ${efectoHora.peor.etiqueta}` : 'Por hora del día'}
          subtitle="Rendimiento según la hora local a la que terminó la partida. La línea punteada es el 50%."
        >
          {horasClase.length === 0 ? (
            <Vacio>Sin datos todavía.</Vacio>
          ) : (
            <div className="space-y-5">
              <BarrasV
                datos={columnasHora}
                max={maxEje}
                referencia={50}
                unidad="%"
                cadaCuantasEtiquetas={3}
              />
              {efectoHora ? (
                <Conclusion>
                  {efectoHora.hay ? (
                    <>
                      <p>
                        Tu peor hora es <strong>{efectoHora.peor.etiqueta}</strong> (
                        {efectoHora.peor.wilson.toFixed(0)}% sobre {efectoHora.peor.n} partidas) y la
                        mejor es <strong>{efectoHora.mejor.etiqueta}</strong> (
                        {efectoHora.mejor.wilson.toFixed(0)}% sobre {efectoHora.mejor.n}).
                      </p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-apagado">
                        Con cuidado: son 24 horas comparadas a la vez, así que la peor y la mejor se
                        separan un poco por azar aunque no haya ningún efecto real. Es sugerente, no
                        establecido. Y la hora probablemente describe el tipo de sesión —un rato
                        corto al mediodía no es lo mismo que una tarde con tiempo— más que el reloj
                        biológico.
                      </p>
                    </>
                  ) : (
                    <p>No hay una hora mejor que otra: los rangos de todas se solapan.</p>
                  )}
                </Conclusion>
              ) : null}
              <details className="group">
                <summary className="cursor-pointer list-none text-xs text-tenue hover:text-texto">
                  <span className="group-open:hidden">▸ Ver la tabla completa</span>
                  <span className="hidden group-open:inline">▾ Ocultar la tabla</span>
                </summary>
                <div className="mt-3">
                  <Tabla
                    aligns={['text', 'text', 'num']}
                    headers={[
                      'Hora',
                      'Tipo',
                      <span key="r" className="inline-flex items-center">
                        Rendimiento
                        {AYUDA_RENDIMIENTO}
                      </span>,
                    ]}
                  >
                    {horasClase.map((h) => {
                      const n = h.n ?? 0;
                      return (
                        <Fila key={`${h.time_class}-${h.hour_local}`} atenuada={n < N_MINIMO}>
                          <Td className="tabular-nums">{String(h.hour_local).padStart(2, '0')}:00</Td>
                          <Td>
                            <Badge>{h.time_class}</Badge>
                          </Td>
                          <Td num>
                            <Rendimiento pctValue={h.score_pct} wilson={h.score_pct_lower} n={n} />
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

        <Panel
          title={efectoSesion && !efectoSesion.hay ? 'No te fatigas dentro de la sesión' : 'Fatiga'}
          subtitle="Rendimiento según cuántas partidas llevas en la sesión (6 = sexta o más)"
        >
          {sesionClase.length === 0 ? (
            <Vacio>Sin datos todavía.</Vacio>
          ) : (
            <div className="space-y-5">
              {columnasSesion.length > 0 ? (
                <BarrasV datos={columnasSesion} max={maxEje} referencia={50} unidad="%" />
              ) : null}
              {efectoSesion ? (
                <Conclusion>
                  {efectoSesion.hay ? (
                    <p>
                      Rindes peor en <strong>{efectoSesion.peor.etiqueta}</strong> partida de la
                      sesión ({efectoSesion.peor.wilson.toFixed(0)}% sobre {efectoSesion.peor.n}) que
                      en <strong>{efectoSesion.mejor.etiqueta}</strong> (
                      {efectoSesion.mejor.wilson.toFixed(0)}% sobre {efectoSesion.mejor.n}).
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>No hay fatiga medible.</strong> De la primera partida a la sexta o
                        más, tu rendimiento se mueve entre{' '}
                        <span className="tabular-nums">{efectoSesion.peor.wilson.toFixed(0)}%</span> y{' '}
                        <span className="tabular-nums">{efectoSesion.mejor.wilson.toFixed(0)}%</span>,
                        y los rangos se solapan por completo.
                      </p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-apagado">
                        Es un resultado, no un dato que falte: no tienes que acortar tus sesiones por
                        esto.
                      </p>
                    </>
                  )}
                </Conclusion>
              ) : null}
              <details className="group">
                <summary className="cursor-pointer list-none text-xs text-tenue hover:text-texto">
                  <span className="group-open:hidden">▸ Ver la tabla completa</span>
                  <span className="hidden group-open:inline">▾ Ocultar la tabla</span>
                </summary>
                <div className="mt-3">
                  <Tabla
                    aligns={['text', 'text', 'num']}
                    headers={[
                      'Partida de la sesión',
                      'Tipo',
                      <span key="r" className="inline-flex items-center">
                        Rendimiento
                        {AYUDA_RENDIMIENTO}
                      </span>,
                    ]}
                  >
                    {sesionClase.map((s) => {
                      const n = s.n ?? 0;
                      return (
                        <Fila key={`${s.time_class}-${s.game_index_capped}`} atenuada={n < N_MINIMO}>
                          <Td className="tabular-nums">
                            {s.game_index_capped === 6 ? '6 o más' : s.game_index_capped}
                          </Td>
                          <Td>
                            <Badge>{s.time_class}</Badge>
                          </Td>
                          <Td num>
                            <Rendimiento pctValue={s.score_pct} wilson={s.score_pct_lower} n={n} />
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

        <Panel
          title={efectoTilt && !efectoTilt.hay ? 'No juegas peor después de perder' : 'Tilt'}
          subtitle="Cómo te va en la partida siguiente según cómo terminó la anterior"
        >
          {despuesClase.length === 0 ? (
            <Vacio>Sin datos todavía.</Vacio>
          ) : (
            <div className="space-y-5">
              <BarrasV
                datos={cortesTilt.map((c) => ({
                  etiqueta: c.etiqueta,
                  valor: c.wilson,
                  n: c.n,
                  titulo: `n=${c.n} · Wilson ${c.wilson.toFixed(1)}% · bruto ${c.bruto.toFixed(1)}%`,
                }))}
                max={maxEje}
                referencia={50}
                unidad="%"
                alto="h-20"
              />
              {efectoTilt ? (
                <Conclusion>
                  {efectoTilt.hay ? (
                    <p>
                      Rindes peor <strong>{efectoTilt.peor.etiqueta}</strong> (
                      {efectoTilt.peor.wilson.toFixed(0)}% sobre {efectoTilt.peor.n} partidas) que{' '}
                      <strong>{efectoTilt.mejor.etiqueta}</strong> (
                      {efectoTilt.mejor.wilson.toFixed(0)}% sobre {efectoTilt.mejor.n}).
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>No hay tilt medible.</strong> Medido sobre{' '}
                        {partidasTilt.toLocaleString('es-CL')} partidas de rápida, la diferencia
                        entre jugar después de ganar y después de perder es de{' '}
                        <span className="tabular-nums">
                          {Math.abs(efectoTilt.mejor.bruto - efectoTilt.peor.bruto).toFixed(1)}
                        </span>{' '}
                        puntos, y los rangos se solapan por completo.
                      </p>
                      <p className="mt-2 text-[11.5px] leading-relaxed text-apagado">
                        Para resolver una diferencia tan chica harían falta miles de partidas por
                        brazo, así que no es un número que vaya a mejorar con el tiempo: es la
                        respuesta. No dejes de jugar después de una derrota por miedo al tilt.
                      </p>
                    </>
                  )}
                </Conclusion>
              ) : null}
            </div>
          )}
        </Panel>
      </div>
    </Pagina>
  );
}
