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
 *
 * No recibe un alto: se estira al alto de su fila (`items-stretch`), que es el del tablero. Antes
 * era un numero fijo en pixeles y por eso no calzaba con el tablero en celular, donde el ancho
 * — y por lo tanto el alto — del tablero es fluido. El numero va DENTRO de la barra, en el
 * extremo del que va ganando, como en chess.com: asi la columna es solo la barra y el alto calza
 * exacto sin aritmetica.
 */
export function BarraVentaja({
  evalCp,
  mateIn,
  orientacion,
}: {
  evalCp: number | null;
  mateIn: number | null;
  /** Con negras abajo, la barra se da vuelta junto con el tablero. */
  orientacion: 'white' | 'black';
}) {
  // Un mate anunciado es una barra al tope, no un 99%: no hay grados de "mate en 3".
  const porcentajeBlancas =
    mateIn !== null ? (mateIn > 0 ? 100 : 0) : evalCp === null ? 50 : winPct(evalCp);

  const etiqueta =
    mateIn !== null ? `M${Math.abs(mateIn)}` : evalCp === null ? '—' : cpAPeones(evalCp);

  // Quien va ganando decide en que extremo se dibuja la etiqueta y de que color, para que se lea
  // sobre su propia mitad de la barra.
  const ganaBlancas = porcentajeBlancas >= 50;
  const ladoBlancas = orientacion === 'white' ? 'bottom' : 'top';
  const ladoEtiqueta = ganaBlancas ? ladoBlancas : ladoBlancas === 'bottom' ? 'top' : 'bottom';

  return (
    <div
      className="relative w-7 shrink-0 overflow-hidden rounded-[5px] border border-borde"
      style={{ background: 'var(--color-ventaja-negras)' }}
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
          [ladoBlancas]: 0,
        }}
      />
      <span
        className="absolute inset-x-0 text-center font-mono text-[10px] font-bold tabular-nums"
        style={{
          [ladoEtiqueta]: 3,
          color: ganaBlancas ? 'var(--color-ventaja-negras)' : 'var(--color-ventaja-blancas)',
        }}
      >
        {etiqueta}
      </span>
    </div>
  );
}
