import { afterResult, byHour, bySessionIndex } from '@/lib/data';
import { Ayuda, Badge, Fila, Pagina, Panel, Rendimiento, Tabla, Td, Vacio } from '@/components/ui';
import { BarrasV, type BarraV } from '@/components/charts/BarrasV';

export const dynamic = 'force-dynamic';

const AYUDA_RENDIMIENTO = (
  <Ayuda alinear="der">
    El número grande es la cota inferior de Wilson: corrige a la baja el porcentaje bruto cuando
    la muestra es chica, para que no parezca mejor o peor de lo que es por casualidad. Debajo, el
    porcentaje bruto y n (número de partidas de este corte).
  </Ayuda>
);

/**
 * Pregunta 2: tilt y fatiga. Hora local de Santiago, numero de partida en la sesion, y que
 * pasa despues de una derrota. Las vistas ya vienen en `America/Santiago`.
 */
export default async function RitmoPage() {
  const [horas, sesion, despues] = await Promise.all([byHour(), bySessionIndex(), afterResult()]);

  const clases = [...new Set(horas.map((h) => h.time_class).filter((c): c is string => c !== null))].sort();

  // La clase con mas partidas manda el grafico: mezclar bullet y rapid en las mismas columnas
  // compararia cosas distintas. El resto sigue disponible en la tabla.
  const totalPorClase = new Map<string, number>();
  for (const h of horas) {
    const clase = h.time_class ?? '';
    totalPorClase.set(clase, (totalPorClase.get(clase) ?? 0) + (h.n ?? 0));
  }
  const claseGrafico = [...totalPorClase.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const columnasHora: BarraV[] = Array.from({ length: 24 }, (_, hora) => {
    const fila = horas.find((h) => h.time_class === claseGrafico && h.hour_local === hora);
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

  const columnasSesion: BarraV[] = sesion
    .filter((s) => s.time_class === claseGrafico)
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

  return (
    <Pagina
      titulo="Ritmo"
      subtitulo={
        <>
          Tilt y fatiga, en horario de Santiago. Los gráficos muestran <strong className="text-texto">{claseGrafico || 'tu control de tiempo más jugado'}</strong>, que es donde tienes más partidas; el resto está en las tablas. Las columnas con menos de 20 partidas salen atenuadas: un corte sobre 12 partidas es ruido, no un patrón.
        </>
      }
    >
      <div className="space-y-6">
        <Panel
          title="Por hora del día"
          subtitle="Rendimiento según la hora local a la que terminó la partida. La línea punteada es el 50%."
        >
          {horas.length === 0 ? (
            <Vacio>Sin datos todavía.</Vacio>
          ) : (
            <div className="space-y-5">
              <BarrasV datos={columnasHora} max={100} referencia={50} unidad="%" cadaCuantasEtiquetas={3} />
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
                    {horas.map((h) => {
                      const n = h.n ?? 0;
                      return (
                        <Fila key={`${h.time_class}-${h.hour_local}`} atenuada={n < 20}>
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
          title="Fatiga"
          subtitle="Rendimiento según cuántas partidas llevas en la sesión (6 = sexta o más)"
        >
          {sesion.length === 0 ? (
            <Vacio>Sin datos todavía.</Vacio>
          ) : (
            <div className="space-y-5">
              {columnasSesion.length > 0 ? (
                <BarrasV datos={columnasSesion} max={100} referencia={50} unidad="%" />
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
                    {sesion.map((s) => {
                      const n = s.n ?? 0;
                      return (
                        <Fila key={`${s.time_class}-${s.game_index_capped}`} atenuada={n < 20}>
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

        <Panel title="Tilt" subtitle="Cómo te va en la partida siguiente según cómo terminó la anterior">
          {despues.length === 0 ? (
            <Vacio>Sin datos todavía.</Vacio>
          ) : (
            <div className="space-y-5">
              {clases.map((clase) => {
                const filas = despues.filter((d) => d.time_class === clase);
                if (filas.length === 0) return null;
                const orden = { win: 0, draw: 1, loss: 2 } as const;
                const ordenadas = [...filas].sort(
                  (a, b) =>
                    (orden[a.prev_result as keyof typeof orden] ?? 9) -
                    (orden[b.prev_result as keyof typeof orden] ?? 9),
                );
                return (
                  <div key={clase}>
                    <h3 className="mb-2 text-2xs uppercase tracking-wider text-tenue">{clase}</h3>
                    <BarrasV
                      datos={ordenadas.map((d) => ({
                        etiqueta:
                          d.prev_result === 'win' ? 'tras ganar' : d.prev_result === 'loss' ? 'tras perder' : 'tras tablas',
                        valor: (d.score_pct_lower ?? 0) * 100,
                        n: d.n ?? 0,
                        titulo: `n=${d.n} · Wilson ${((d.score_pct_lower ?? 0) * 100).toFixed(1)}% · bruto ${((d.score_pct ?? 0) * 100).toFixed(1)}%`,
                      }))}
                      max={100}
                      referencia={50}
                      unidad="%"
                      alto="h-20"
                    />
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
