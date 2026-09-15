/**
 * Calendario del mes en curso: un cuadrito por dia, mas oscuro cuanto menos jugaste. Responde
 * "¿estoy jugando o solo mirando estadisticas?" de un vistazo, que es la pregunta que la regla
 * de la portada quiere mantener al frente.
 *
 * La escala es ordinal (sin jugar / 1 / 2 / 3+), no continua: cuatro pasos se distinguen; un
 * degradado de 0 a 9 partidas no. Los dias futuros van con borde punteado y sin relleno, para
 * que no se lean como "no jugaste".
 */
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export type DiaJugado = { dia: number; partidas: number };

export function MonthCalendar({
  anio,
  mes,
  dias,
  hoy,
}: {
  anio: number;
  /** 1-12. */
  mes: number;
  dias: readonly DiaJugado[];
  /** Dia del mes que se marca como hoy. 0 si el mes mostrado no es el actual. */
  hoy: number;
}) {
  const totalDias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  // getUTCDay() da 0=domingo; la grilla arranca en lunes, asi que se rota.
  const primerDia = (new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay() + 6) % 7;

  const porDia = new Map(dias.map((d) => [d.dia, d.partidas]));

  const estilo = (n: number, futuro: boolean, esHoy: boolean): string => {
    if (esHoy) return 'bg-acento text-fondo';
    if (futuro) return 'border border-dashed border-borde text-apagado/60';
    if (n >= 3) return 'bg-bien text-fondo';
    if (n === 2) return 'bg-bien/55 text-fondo';
    if (n === 1) return 'bg-bien/25 text-texto';
    return 'bg-panel-alto text-tenue';
  };

  return (
    <div>
      <div className="grid grid-cols-7 gap-[5px]">
        {DIAS.map((d, i) => (
          <span key={i} className="text-center font-mono text-[10px] font-medium text-apagado">
            {d}
          </span>
        ))}
        {Array.from({ length: primerDia }, (_, i) => (
          <span key={`hueco-${i}`} />
        ))}
        {Array.from({ length: totalDias }, (_, i) => {
          const dia = i + 1;
          const n = porDia.get(dia) ?? 0;
          const futuro = hoy > 0 && dia > hoy;
          const esHoy = dia === hoy;
          return (
            <span
              key={dia}
              title={`${dia} · ${n} ${n === 1 ? 'partida' : 'partidas'}`}
              className={`flex aspect-square items-center justify-center rounded-[7px] font-mono text-[11.5px] font-medium ${estilo(n, futuro, esHoy)}`}
            >
              {dia}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5 text-[11.5px] text-apagado">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-bien" />3 o más
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-bien/25" />1 a 2
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-panel-alto" />
          sin jugar
        </span>
      </div>
    </div>
  );
}
