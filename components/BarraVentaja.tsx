import { winPct } from '@/lib/analysis/winpct';
import { cpAPeones } from '@/components/ui';

/**
 * La barra vertical blanco/negro que todo ajedrecista reconoce: de un vistazo dice quien va
 * ganando, sin leer un numero.
 *
 * La proporcion es `winPct`, no centipeones. Los centipeones no estan acotados (un mate vale
 * 10.000), asi que una barra proporcional a cp estaria pegada a un extremo casi toda la partida.
 * Es la misma funcion que usa el analizador y el grafico de evaluacion.
 *
 * `evalCp` llega SIEMPRE en perspectiva de blancas, como lo guarda `moves.eval_cp`. La barra no
 * vuelve a tocar el signo: la trampa 2 del proyecto es justamente re-derivar signos fuera de
 * `lib/analysis/signs.ts`.
 */
export function BarraVentaja({
  evalCp,
  mateIn,
  orientacion,
  alto,
}: {
  evalCp: number | null;
  mateIn: number | null;
  /** Con negras abajo, la barra se da vuelta junto con el tablero. */
  orientacion: 'white' | 'black';
  /** Alto en pixeles, para que calce con el tablero de al lado. */
  alto: number;
}) {
  // Un mate anunciado es una barra al tope, no un 99%: no hay grados de "mate en 3".
  const porcentajeBlancas =
    mateIn !== null ? (mateIn > 0 ? 100 : 0) : evalCp === null ? 50 : winPct(evalCp);

  const etiqueta =
    mateIn !== null ? `M${Math.abs(mateIn)}` : evalCp === null ? '—' : cpAPeones(evalCp);

  // Quien va ganando decide de que color es el texto de la etiqueta, para que se lea sobre su
  // propia mitad de la barra.
  const ganaBlancas = porcentajeBlancas >= 50;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <span
        className="font-mono text-[12.5px] font-semibold tabular-nums"
        aria-label={`Evaluacion ${etiqueta}`}
      >
        {etiqueta}
      </span>
      <div
        className="relative w-5 overflow-hidden rounded-[5px] border border-borde"
        style={{ height: alto, background: 'var(--color-ventaja-negras)' }}
        role="img"
        aria-label={
          evalCp === null && mateIn === null
            ? 'Posicion sin evaluar'
            : `Ventaja ${ganaBlancas ? 'de blancas' : 'de negras'}: ${etiqueta}`
        }
      >
        <div
          className="absolute inset-x-0 transition-[height] duration-200"
          style={{
            height: `${porcentajeBlancas}%`,
            background: 'var(--color-ventaja-blancas)',
            // Con blancas abajo la porcion blanca crece desde abajo; con el tablero girado,
            // desde arriba. Asi la barra siempre apunta hacia el lado del jugador que manda.
            [orientacion === 'white' ? 'bottom' : 'top']: 0,
          }}
        />
      </div>
    </div>
  );
}
