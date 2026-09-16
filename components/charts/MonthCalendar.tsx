/**
 * Calendario del mes en curso: un cuadrito por dia de RAPIDA, mas oscuro cuanto menos jugaste.
 * Responde "¿estoy jugando lo que dice mi plan?" de un vistazo, que es la pregunta que la regla
 * de la portada quiere mantener al frente.
 *
 * Cuenta rapida y no todas las clases. Hasta la revision integral recibia `n_games`, y como el
 * mes tenia 436 partidas de bala contra 15 de rapida, los quince dias jugados salian verdes:
 * la pantalla que existe para empujar a jugar rapida devolvia un mes completo construido casi
 * entero con el formato que el plan del jugador prohibe. Los dias en que solo hubo otra clase
 * llevan un tercer tono, distinto de "sin jugar": paso algo, pero no lo que cuenta.
 *
 * La escala es ordinal (sin jugar / otra clase / 1-2 / 3+), no continua: los pasos se
 * distinguen; un degradado de 0 a 9 partidas no. Los dias futuros van con borde punteado y sin
 * relleno, para que no se lean como "no jugaste".
 */
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export type DiaJugado = {
  dia: number;
  /** Partidas de rapida: es lo que pinta el cuadrito. */
  partidas: number;
  /** Partidas de cualquier otra clase ese dia. Solo decide el tercer tono. */
  otras: number;
};

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

  const porDia = new Map(dias.map((d) => [d.dia, d]));

  const estilo = (n: number, otras: number, futuro: boolean, esHoy: boolean): string => {
    if (esHoy) return 'bg-acento text-fondo';
    if (futuro) return 'border border-dashed border-borde text-apagado/60';
    if (n >= 3) return 'bg-bien text-fondo';
    if (n === 2) return 'bg-bien/55 text-fondo';
    if (n === 1) return 'bg-bien/25 text-texto';
    // Jugo, pero nada de rapida. No es un dia en blanco y tampoco cuenta para el plan.
    if (otras > 0) return 'border border-borde-fuerte bg-panel-alto text-tenue';
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
          const d = porDia.get(dia);
          const n = d?.partidas ?? 0;
          const otras = d?.otras ?? 0;
          const futuro = hoy > 0 && dia > hoy;
          const esHoy = dia === hoy;
          return (
            <span
              key={dia}
              title={`${dia} · ${n} de rápida${otras > 0 ? ` · ${otras} de otra clase` : ''}`}
              className={`flex aspect-square items-center justify-center rounded-[7px] font-mono text-[11.5px] font-medium ${estilo(n, otras, futuro, esHoy)}`}
            >
              {dia}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5 text-[11.5px] text-apagado">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-bien" />3 o más de rápida
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-bien/25" />1 a 2 de rápida
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] border border-borde-fuerte bg-panel-alto" />
          solo otra clase
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px] bg-panel-alto" />
          sin jugar
        </span>
      </div>
    </div>
  );
}
