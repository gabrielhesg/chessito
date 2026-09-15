/**
 * El diagnostico del error, con la mirada de un entrenador. Puro, determinista, sin motor.
 *
 * Existe porque `conceptoDelError` mira la POSICION de forma estructural y, cuando no reconoce un
 * patron, cae en "la posicion empeora bastante". Esa frase terminaba apareciendo en casi todos
 * los ejercicios, que es lo mismo que no decir nada.
 *
 * Lo que cambia aca es la fuente: se diagnostica sobre la **linea de refutacion**, o sea sobre lo
 * que el rival te hacia de verdad, en vez de adivinar sobre la estructura. Es la diferencia entre
 * "la posicion empeora" y "moviste la torre que defendia el caballo, y te lo comen con Cxd4".
 *
 * Devuelve hechos, no frases: `frasesDelDiagnostico` las redacta aparte, para que los hechos se
 * puedan testear contra posiciones reales sin comparar strings.
 */
import { Chess, type Square } from 'chess.js';
import {
  NOMBRE_PIEZA,
  VALOR,
  uciASan,
  type Concepto,
  type Linea,
} from '@/lib/puzzles/explain';

/** Lo que hacia la jugada correcta. Se mira sobre la posicion del ejercicio, no sobre la linea. */
export type QueHaciaLaBuena =
  | 'captura'
  | 'da_jaque'
  | 'defiende_la_amenazada'
  | 'mueve_la_amenazada'
  | 'ataca_al_atacante'
  | 'otra';

export type Diagnostico = {
  concepto: Concepto;
  /** La jugada del rival que no viste, en notacion algebraica. Lo primero que diria un entrenador. */
  jugadaQueNoViste: string | null;
  /**
   * Cuantas jugadas del rival pasan hasta el golpe. 1 es la respuesta inmediata; mas que eso
   * significa que el problema no era la jugada siguiente, que es informacion de calidad.
   */
  jugadasHastaElGolpe: number | null;
  /** La pieza que pierdes, si pierdes alguna. */
  perdida: { nombre: string; valor: number; casilla: string } | null;
  /** La primera captura del rival cae justo en la casilla a la que moviste. */
  colgasteLaQueMoviste: boolean;
  /** Tu pieza defendia a la victima y al moverla la dejaste sola. El error clasico. */
  abandonasteLaDefensa: { nombre: string; desde: string } | null;
  /** La victima ya estaba atacada y sin defensa suficiente ANTES de tu jugada. */
  amenazaYaExistia: boolean;
  /** Las piezas tuyas que la jugada del rival ataca a la vez. Dos o mas es horquilla. */
  horquilla: string[] | null;
  terminaEnMate: boolean;
  /**
   * Piezas tuyas que quedan amenazadas (mas atacantes que defensores) DESPUES de la respuesta del
   * rival y que no lo estaban antes. Es lo que salva al diagnostico de caer en "la posicion
   * empeora" cuando no se pierde material de inmediato: casi siempre hay una amenaza concreta que
   * nombrar, y nombrarla es lo que un entrenador haria.
   */
  amenazadasDespues: string[];
  laBuena: { san: string; que: QueHaciaLaBuena } | null;
};

const VALIOSA = 3;

function esCuadro(valor: string | undefined): valor is Square {
  return typeof valor === 'string' && /^[a-h][1-8]$/.test(valor);
}

/** Las piezas tuyas (de valor, o el rey) que ataca la pieza parada en `desde`. */
function piezasAtacadasDesde(fen: string, desde: Square, mias: 'w' | 'b'): string[] {
  let tablero: Chess;
  try {
    tablero = new Chess(fen);
  } catch {
    return [];
  }
  const atacadas: string[] = [];
  for (const fila of tablero.board()) {
    for (const celda of fila) {
      if (!celda || celda.color !== mias) continue;
      if ((VALOR[celda.type] ?? 0) < VALIOSA && celda.type !== 'k') continue;
      // `attackers` da las casillas que atacan esa casilla: alcanza con ver si la del rival esta.
      if (tablero.attackers(celda.square, mias === 'w' ? 'b' : 'w').includes(desde)) {
        atacadas.push(NOMBRE_PIEZA[celda.type] ?? celda.type);
      }
    }
  }
  return atacadas;
}

/** Las piezas tuyas que quedan en peligro en `despues` y no lo estaban en `antes`. */
function amenazasNuevas(antes: Chess, fenDespues: string, mias: 'w' | 'b'): string[] {
  let despues: Chess;
  try {
    despues = new Chess(fenDespues);
  } catch {
    return [];
  }
  const nuevas: string[] = [];
  for (const fila of despues.board()) {
    for (const celda of fila) {
      if (!celda || celda.color !== mias) continue;
      if ((VALOR[celda.type] ?? 0) < VALIOSA) continue;
      if (!estaEnPeligro(despues, celda.square, mias)) continue;
      if (estaEnPeligro(antes, celda.square, mias)) continue;
      nuevas.push(`${NOMBRE_PIEZA[celda.type] ?? celda.type} de ${celda.square}`);
    }
  }
  return nuevas;
}

/** Si una pieza tuya en esa casilla tiene mas atacantes que defensores. */
function estaEnPeligro(tablero: Chess, casilla: Square, mias: 'w' | 'b'): boolean {
  const pieza = tablero.get(casilla);
  if (!pieza || pieza.color !== mias) return false;
  const atacantes = tablero.attackers(casilla, mias === 'w' ? 'b' : 'w').length;
  if (atacantes === 0) return false;
  return atacantes > tablero.attackers(casilla, mias).length;
}

export function diagnosticar({
  fen,
  playedUci,
  bestUci,
  refutacion,
  cpLoss,
}: {
  /** La posicion del ejercicio: antes de tu jugada, y te toca mover. */
  fen: string;
  playedUci: string;
  bestUci: string;
  /** La linea desde la posicion DESPUES de tu jugada: la abre el rival. */
  refutacion: Linea | null;
  cpLoss: number;
}): Diagnostico | null {
  let antes: Chess;
  try {
    antes = new Chess(fen);
  } catch {
    return null;
  }
  const mias = antes.turn();
  const destino = playedUci.slice(2, 4);
  const origen = playedUci.slice(0, 2);
  if (!esCuadro(destino) || !esCuadro(origen)) return null;

  const pasosRival = refutacion?.pasos.filter((p) => !p.mia) ?? [];
  const primeraCaptura = pasosRival.find((p) => p.captura);
  const victima = primeraCaptura?.hasta;

  // Lo primero que diria un entrenador: cual es la jugada que no viste.
  const jugadaQueNoViste = refutacion?.pasos[0]?.mia === false ? refutacion.pasos[0].san : null;
  const golpe = primeraCaptura ?? pasosRival.find((p) => p.mate);
  const jugadasHastaElGolpe = golpe ? pasosRival.indexOf(golpe) + 1 : null;

  let abandonasteLaDefensa: Diagnostico['abandonasteLaDefensa'] = null;
  let amenazaYaExistia = false;
  if (esCuadro(victima) && victima !== destino) {
    const enLaVictima = antes.get(victima);
    if (enLaVictima?.color === mias) {
      // La pieza que moviste, ¿defendia esa casilla antes de moverse?
      if (antes.attackers(victima, mias).includes(origen)) {
        const movida = antes.get(origen);
        abandonasteLaDefensa = movida
          ? { nombre: NOMBRE_PIEZA[movida.type] ?? movida.type, desde: origen }
          : null;
      }
      amenazaYaExistia = estaEnPeligro(antes, victima, mias);
    }
  }

  // La horquilla se mide sobre la jugada que el rival JUEGA de verdad, no sobre una hipotetica:
  // se mira que piezas tuyas ataca desde la casilla en la que acaba de aterrizar.
  const primeraDelRival = refutacion?.pasos[0];
  const horquilladas =
    primeraDelRival && !primeraDelRival.mia && esCuadro(primeraDelRival.hasta)
      ? piezasAtacadasDesde(primeraDelRival.fen, primeraDelRival.hasta, mias)
      : [];
  const horquilla = horquilladas.length >= 2 ? horquilladas : null;

  // La casilla desde la que sale el golpe: sirve para reconocer la respuesta que ataca justo a la
  // pieza que venia a hacer el dano (en el mate del pastor, ...g6 contra la dama de h5).
  const desdeDondeGolpea =
    primeraDelRival && !primeraDelRival.mia ? primeraDelRival.desde : undefined;
  const laBuena = queHaciaLaBuena({ antes, fen, bestUci, victima, mias, desdeDondeGolpea });

  const amenazadasDespues =
    primeraDelRival && !primeraDelRival.mia
      ? amenazasNuevas(antes, primeraDelRival.fen, mias)
      : [];

  const concepto: Concepto | null = refutacion?.terminaEnMate
    ? 'permite_mate'
    : esCuadro(victima) && victima === destino
      ? 'cuelga_la_pieza_movida'
      : abandonasteLaDefensa
        ? 'abandonas_la_defensa'
        : horquilla
          ? 'permite_horquilla'
          : amenazaYaExistia
            ? 'no_atiendes_la_amenaza'
            : primeraCaptura
              ? 'pierde_material'
              : amenazadasDespues.length > 0
                ? 'permite_una_amenaza'
                : cpLoss >= 100
                  ? 'empeora_la_posicion'
                  : null;
  if (!concepto) return null;

  return {
    concepto,
    jugadaQueNoViste,
    jugadasHastaElGolpe,
    perdida: primeraCaptura?.captura
      ? {
          nombre: primeraCaptura.captura.nombre,
          valor: primeraCaptura.captura.valor,
          casilla: primeraCaptura.hasta,
        }
      : null,
    colgasteLaQueMoviste: victima === destino,
    abandonasteLaDefensa,
    amenazaYaExistia,
    horquilla,
    terminaEnMate: refutacion?.terminaEnMate ?? false,
    amenazadasDespues,
    laBuena,
  };
}

function queHaciaLaBuena({
  antes,
  fen,
  bestUci,
  victima,
  mias,
  desdeDondeGolpea,
}: {
  antes: Chess;
  fen: string;
  bestUci: string;
  victima: string | undefined;
  mias: 'w' | 'b';
  desdeDondeGolpea: string | undefined;
}): Diagnostico['laBuena'] {
  const san = uciASan(fen, bestUci);
  if (!san) return null;

  let despues: Chess;
  let jugada;
  try {
    despues = new Chess(fen);
    jugada = despues.move({
      from: bestUci.slice(0, 2),
      to: bestUci.slice(2, 4),
      promotion: bestUci.length > 4 ? bestUci.slice(4) : undefined,
    });
  } catch {
    return { san, que: 'otra' };
  }

  // El orden importa: sacar la pieza amenazada y defenderla son respuestas a la amenaza, y son
  // mas informativas que "captura" cuando las dos cosas pasan a la vez.
  if (esCuadro(victima) && bestUci.slice(0, 2) === victima) {
    return { san, que: 'mueve_la_amenazada' };
  }
  if (
    esCuadro(victima) &&
    despues.attackers(victima, mias).length > antes.attackers(victima, mias).length
  ) {
    return { san, que: 'defiende_la_amenazada' };
  }
  if (
    esCuadro(desdeDondeGolpea) &&
    despues.attackers(desdeDondeGolpea, mias).length > antes.attackers(desdeDondeGolpea, mias).length
  ) {
    return { san, que: 'ataca_al_atacante' };
  }
  if (jugada.captured) return { san, que: 'captura' };
  if (despues.isCheck()) return { san, que: 'da_jaque' };
  return { san, que: 'otra' };
}

/**
 * El diagnostico en palabras, como lo diria un entrenador: que te hacia el rival, que te falto
 * ver, y que conseguia la buena. Una frase por idea y ninguna inventada — cada una se apoya en un
 * hecho de `Diagnostico`.
 */
export function frasesDelDiagnostico(d: Diagnostico): string[] {
  const frases: string[] = [];

  if (d.jugadaQueNoViste) {
    const golpeTardio = (d.jugadasHastaElGolpe ?? 1) > 1;
    if (d.terminaEnMate) {
      frases.push(`Lo que no viste es ${d.jugadaQueNoViste}: a partir de ahí el mate es forzado.`);
    } else if (d.horquilla) {
      frases.push(
        `Lo que no viste es ${d.jugadaQueNoViste}: desde ahí ataca tu ${d.horquilla.join(' y tu ')} a la vez, y solo puedes salvar una.`,
      );
    } else if (d.perdida) {
      frases.push(
        `Lo que no viste es ${d.jugadaQueNoViste}: te cobra el ${d.perdida.nombre} de ${d.perdida.casilla}` +
          (golpeTardio
            ? `, y ojo, no llega de inmediato sino ${d.jugadasHastaElGolpe} jugadas después.`
            : '.'),
      );
    } else if (d.amenazadasDespues.length > 0) {
      frases.push(
        `Lo que no viste es ${d.jugadaQueNoViste}: después de esa jugada tu ${d.amenazadasDespues.join(' y tu ')} queda${d.amenazadasDespues.length > 1 ? 'n' : ''} con más atacantes que defensores.`,
      );
    } else {
      frases.push(`Lo que no viste es ${d.jugadaQueNoViste}.`);
    }
  }

  if (d.colgasteLaQueMoviste) {
    frases.push(
      'Antes de mover una pieza, la pregunta es siempre la misma: en la casilla a la que va, ¿quién la ataca y quién la defiende? Ahí te la comen.',
    );
  } else if (d.abandonasteLaDefensa) {
    frases.push(
      `Tu ${d.abandonasteLaDefensa.nombre} de ${d.abandonasteLaDefensa.desde} no estaba solo paseando: era el que defendía esa pieza. Al moverlo la dejaste sola. Antes de mover, mira siempre qué está defendiendo la pieza que vas a tocar.`,
    );
  } else if (d.concepto === 'permite_una_amenaza') {
    frases.push(
      'No pierdes material de inmediato, pero le regalas al rival una jugada con amenaza: él avanza su plan y tú tienes que defender. Ahí es donde se pierden las partidas sin un error visible.',
    );
  } else if (d.amenazaYaExistia) {
    frases.push(
      'La amenaza ya estaba en el tablero antes de tu jugada: no la creaste, la dejaste pasar. Cuando el rival mueve, la primera pregunta es qué amenaza ahora.',
    );
  }

  if (d.laBuena) {
    const explicacion: Record<QueHaciaLaBuena, string> = {
      mueve_la_amenazada: 'saca de ahí justo la pieza que te iban a comer',
      defiende_la_amenazada: 'le pone una defensa más a la pieza que estaba en peligro',
      ataca_al_atacante: 'le pega justo a la pieza que venía a hacer el daño: el rival tiene que ocuparse de ella primero',
      captura: 'cobra material primero, y eso cambia el orden de las cosas',
      da_jaque: 'da jaque: el rival tiene que atender el rey y no alcanza a ejecutar su plan',
      otra: 'no gana material: lo que hace es simplemente no permitir nada de lo anterior',
    };
    frases.push(`${d.laBuena.san} ${explicacion[d.laBuena.que]}.`);
  }

  return frases;
}
