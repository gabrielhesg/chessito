/**
 * Por que la jugada fue mala. Puro, determinista, sin motor y sin LLM.
 *
 * La idea central: la linea de refutacion que devuelve Stockfish para la posicion DESPUES del
 * blunder *es* la explicacion — es como el rival te castigaba. Aca no se inventa nada: se
 * reproduce esa linea sobre el tablero y se cuenta lo que pasa (que capturas, cuanto material
 * cambia de manos, si termina en mate). Lo mismo con la linea de la jugada correcta.
 *
 * Devuelve una estructura, no frases armadas: la redaccion es trabajo de la UI, y asi los
 * numeros se pueden testear contra posiciones reales sin comparar strings.
 */
import { Chess, type Square } from 'chess.js';

const VALOR: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const NOMBRE_PIEZA: Record<string, string> = {
  p: 'peón',
  n: 'caballo',
  b: 'alfil',
  r: 'torre',
  q: 'dama',
  k: 'rey',
};

export type PasoLinea = {
  /** Notacion algebraica, que es como se lee el ajedrez: "Cf3", no "g1f3". */
  san: string;
  /** true si la jugada la hace el lado del ejercicio (Gabriel), false si responde el rival. */
  mia: boolean;
  /** Pieza capturada en esta jugada, si hubo captura. */
  captura?: { pieza: string; nombre: string; valor: number };
  jaque: boolean;
  mate: boolean;
};

export type Linea = {
  pasos: PasoLinea[];
  /** Material neto que gana el rival a lo largo de la linea, en peones. Positivo = pierdes tu. */
  materialPerdido: number;
  terminaEnMate: boolean;
};

export type Explicacion = {
  /** La jugada que se jugo, en notacion algebraica. */
  jugadaSan: string | null;
  /** La jugada que correspondia, en notacion algebraica. */
  mejorSan: string | null;
  /** Como te castigaba el rival. null si no hay linea de refutacion guardada todavia. */
  refutacion: Linea | null;
  /** Que lograba la jugada correcta. null si no hay linea guardada todavia. */
  solucion: Linea | null;
  /** Centipeones perdidos, tal cual los calculo el analizador de la Fase 3. */
  cpLoss: number;
};

/** Reproduce una linea UCI desde un FEN y describe lo que pasa en ella. */
export function describirLinea(fen: string, lineaUci: readonly string[], mueveElMio: boolean): Linea | null {
  if (lineaUci.length === 0) return null;

  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const pasos: PasoLinea[] = [];
  let balance = 0; // en peones, positivo = material que pierde el lado del ejercicio
  let turnoMio = mueveElMio;

  for (const uci of lineaUci) {
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    const promotion = uci.length > 4 ? uci.slice(4) : undefined;

    let jugada;
    try {
      jugada = chess.move({ from, to, promotion });
    } catch {
      // Una linea que no se puede reproducir es una linea que no sirve para explicar nada.
      // Se devuelve lo reproducido hasta acá en vez de mentir con el resto.
      break;
    }

    const capturada = jugada.captured;
    if (capturada) {
      // Si captura el rival, tu pierdes ese material; si capturas tu, lo recuperas.
      balance += (turnoMio ? -1 : 1) * (VALOR[capturada] ?? 0);
    }

    pasos.push({
      san: jugada.san,
      mia: turnoMio,
      ...(capturada
        ? { captura: { pieza: capturada, nombre: NOMBRE_PIEZA[capturada] ?? capturada, valor: VALOR[capturada] ?? 0 } }
        : {}),
      jaque: chess.isCheck(),
      mate: chess.isCheckmate(),
    });

    if (chess.isGameOver()) break;
    turnoMio = !turnoMio;
  }

  if (pasos.length === 0) return null;

  return {
    pasos,
    materialPerdido: balance,
    terminaEnMate: pasos[pasos.length - 1]?.mate ?? false,
  };
}

/** Convierte una jugada UCI a notacion algebraica sobre un FEN, sin alterar la posicion. */
export function uciASan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const jugada = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci.slice(4) : undefined,
    });
    return jugada.san;
  } catch {
    return null;
  }
}

export function explicarBlunder({
  fen,
  playedUci,
  bestUci,
  refutationLine,
  solutionLine,
  cpLoss,
}: {
  /** Posicion ANTES del blunder. Mueve el lado del ejercicio. */
  fen: string;
  playedUci: string;
  bestUci: string;
  /** Linea desde la posicion despues del blunder: la mueve el RIVAL. */
  refutationLine?: readonly string[] | null;
  /** Linea desde la posicion del ejercicio: la abre la jugada correcta, o sea la mueves TU. */
  solutionLine?: readonly string[] | null;
  cpLoss: number;
}): Explicacion {
  const jugadaSan = uciASan(fen, playedUci);
  const mejorSan = uciASan(fen, bestUci);

  // La refutacion arranca en la posicion posterior a tu jugada, asi que ahi mueve el rival.
  let fenDespues: string | null = null;
  try {
    const chess = new Chess(fen);
    chess.move({
      from: playedUci.slice(0, 2),
      to: playedUci.slice(2, 4),
      promotion: playedUci.length > 4 ? playedUci.slice(4) : undefined,
    });
    fenDespues = chess.fen();
  } catch {
    fenDespues = null;
  }

  return {
    jugadaSan,
    mejorSan,
    refutacion:
      fenDespues && refutationLine?.length ? describirLinea(fenDespues, refutationLine, false) : null,
    solucion: solutionLine?.length ? describirLinea(fen, solutionLine, true) : null,
    cpLoss,
  };
}
