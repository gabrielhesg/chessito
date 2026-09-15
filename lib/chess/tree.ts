/**
 * El arbol de jugadas de una partida: la linea principal es lo que realmente se jugo, y de
 * cualquier nodo pueden colgar variaciones — "que hubiera pasado si...".
 *
 * Convencion central, y no es arbitraria: **`childIds[0]` es la continuacion y `childIds[1..]`
 * son variaciones**. Con eso "linea principal" sale gratis (seguir siempre el primer hijo) y
 * coincide con como el PGN representa las variantes, asi que exportar a PGN algun dia es
 * recorrer esto, no rehacerlo.
 *
 * Todo aca es puro y sin React: el cursor, la navegacion y la creacion de variaciones son
 * exactamente el tipo de logica que se rompe en silencio, asi que va testeada aparte de la UI.
 *
 * La legalidad de una jugada NO se valida a mano: se delega en `chess.js`, que ya sabe de
 * enroques, al paso y promociones. Si `move()` tira, la jugada era ilegal.
 */
import { Chess } from 'chess.js';

export type NodeId = string;

export type MoveNode<T = unknown> = {
  id: NodeId;
  parentId: NodeId | null;
  /** Notacion algebraica, para mostrar. Vacio en la raiz. */
  san: string;
  /** La jugada en UCI, para hablar con el motor. Vacio en la raiz. */
  uci: string;
  /** La posicion DESPUES de esta jugada. En la raiz, la posicion inicial. */
  fen: string;
  /** Numero de media jugada desde el inicio. La raiz es 0. */
  ply: number;
  childIds: NodeId[];
  /**
   * Datos de la partida real (evaluacion, clasificacion, reloj). null en una variacion: esas
   * jugadas nunca ocurrieron, asi que no existen en la tabla `moves`. Quien dibuje tiene que
   * tratar ese null como "no hay dato", nunca como cero.
   */
  datos: T | null;
};

export type MoveTree<T = unknown> = {
  rootId: NodeId;
  nodes: Record<NodeId, MoveNode<T>>;
};

/** FEN de la posicion inicial del ajedrez. */
const FEN_INICIAL = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function nuevoId(tree: MoveTree<unknown>): NodeId {
  // Contar nodos alcanza: los ids solo tienen que ser unicos dentro de este arbol, que vive en
  // memoria mientras dura la vista.
  return `n${Object.keys(tree.nodes).length}`;
}

/** Arbol vacio: solo la posicion inicial. */
export function emptyTree<T>(fenInicial: string = FEN_INICIAL): MoveTree<T> {
  const raiz: MoveNode<T> = {
    id: 'raiz',
    parentId: null,
    san: '',
    uci: '',
    fen: fenInicial,
    ply: 0,
    childIds: [],
    datos: null,
  };
  return { rootId: 'raiz', nodes: { raiz } };
}

/**
 * Construye el arbol desde la partida real. Cada jugada queda como continuacion de la anterior,
 * asi que la linea principal ES la partida.
 *
 * Una jugada que `chess.js` no pueda reproducir corta la construccion ahi: mas vale una partida
 * a medias que un arbol con posiciones inventadas.
 */
export function buildFromMainLine<T>(
  jugadas: readonly { san: string; uci: string; datos: T }[],
): MoveTree<T> {
  const tree = emptyTree<T>();
  const tablero = new Chess();
  let anteriorId = tree.rootId;

  for (const [i, jugada] of jugadas.entries()) {
    try {
      tablero.move(jugada.san);
    } catch {
      break;
    }
    const id = `n${i}`;
    tree.nodes[id] = {
      id,
      parentId: anteriorId,
      san: jugada.san,
      uci: jugada.uci,
      fen: tablero.fen(),
      ply: i + 1,
      childIds: [],
      datos: jugada.datos,
    };
    tree.nodes[anteriorId]?.childIds.push(id);
    anteriorId = id;
  }
  return tree;
}

/**
 * Agrega una jugada como hijo de `atId`. Devuelve null si es ilegal.
 *
 * **Deduplica**: si ya existe un hijo con esa misma jugada, devuelve ESE nodo en vez de crear un
 * hermano. Es lo que uno espera al re-jugar sobre el tablero la jugada que ya esta en la
 * partida — sin esto, repetir la jugada real crearia una variacion identica a la linea
 * principal, que no le sirve a nadie.
 */
export function addMove<T>(
  tree: MoveTree<T>,
  atId: NodeId,
  jugada: { from: string; to: string; promotion?: string },
): { tree: MoveTree<T>; nodeId: NodeId } | null {
  const padre = tree.nodes[atId];
  if (!padre) return null;

  let tablero: Chess;
  let hecha;
  try {
    tablero = new Chess(padre.fen);
    hecha = tablero.move({ from: jugada.from, to: jugada.to, promotion: jugada.promotion });
  } catch {
    return null;
  }

  const uci = `${hecha.from}${hecha.to}${hecha.promotion ?? ''}`;
  const existente = padre.childIds.map((id) => tree.nodes[id]).find((n) => n?.uci === uci);
  if (existente) return { tree, nodeId: existente.id };

  const id = nuevoId(tree);
  const nodo: MoveNode<T> = {
    id,
    parentId: atId,
    san: hecha.san,
    uci,
    fen: tablero.fen(),
    ply: padre.ply + 1,
    childIds: [],
    datos: null,
  };

  return {
    tree: {
      rootId: tree.rootId,
      nodes: {
        ...tree.nodes,
        [id]: nodo,
        [atId]: { ...padre, childIds: [...padre.childIds, id] },
      },
    },
    nodeId: id,
  };
}

/** Los nodos de la linea principal, en orden, SIN la raiz. */
export function mainLine<T>(tree: MoveTree<T>): MoveNode<T>[] {
  const linea: MoveNode<T>[] = [];
  let actual = tree.nodes[tree.rootId];
  while (actual?.childIds[0]) {
    const siguiente = tree.nodes[actual.childIds[0]];
    if (!siguiente) break;
    linea.push(siguiente);
    actual = siguiente;
  }
  return linea;
}

/** El camino desde la raiz hasta `id`, incluida la raiz. */
export function pathTo<T>(tree: MoveTree<T>, id: NodeId): MoveNode<T>[] {
  const camino: MoveNode<T>[] = [];
  let actual = tree.nodes[id];
  while (actual) {
    camino.unshift(actual);
    actual = actual.parentId ? tree.nodes[actual.parentId] : undefined;
  }
  return camino;
}

/** Las jugadas en UCI desde el inicio hasta `id`. Es lo que el motor necesita. */
export function uciPath<T>(tree: MoveTree<T>, id: NodeId): string[] {
  return pathTo(tree, id)
    .filter((n) => n.uci !== '')
    .map((n) => n.uci);
}

/** true si el nodo pertenece a la partida real (no a una variacion). */
export function isMainLine<T>(tree: MoveTree<T>, id: NodeId): boolean {
  if (id === tree.rootId) return true;
  let actual = tree.nodes[id];
  while (actual?.parentId) {
    const padre = tree.nodes[actual.parentId];
    if (padre?.childIds[0] !== actual.id) return false;
    actual = padre;
  }
  return true;
}

/**
 * El ancestro de la linea principal mas cercano. Sirve para ubicar el marcador del grafico de
 * evaluacion cuando el cursor esta dentro de una variacion: el grafico dibuja la partida real,
 * asi que hay que decirle de que punto de la partida real colgo esta variacion.
 */
export function nearestMainLine<T>(tree: MoveTree<T>, id: NodeId): NodeId {
  let actual = tree.nodes[id];
  while (actual && !isMainLine(tree, actual.id)) {
    actual = actual.parentId ? tree.nodes[actual.parentId] : undefined;
  }
  return actual?.id ?? tree.rootId;
}

/**
 * Borra un nodo y todo lo que cuelga de el. Devuelve donde queda el cursor (el padre).
 *
 * **Rechaza los nodos de la linea principal**: la partida que jugaste es un hecho, no una
 * edicion. Solo se borran variaciones.
 */
export function deleteSubtree<T>(
  tree: MoveTree<T>,
  id: NodeId,
): { tree: MoveTree<T>; cursorId: NodeId } | null {
  const nodo = tree.nodes[id];
  if (!nodo?.parentId || isMainLine(tree, id)) return null;

  const aBorrar = new Set<NodeId>();
  const pila = [id];
  while (pila.length > 0) {
    const actual = pila.pop();
    if (!actual) continue;
    aBorrar.add(actual);
    for (const hijo of tree.nodes[actual]?.childIds ?? []) pila.push(hijo);
  }

  const nodes: Record<NodeId, MoveNode<T>> = {};
  for (const [nodeId, n] of Object.entries(tree.nodes)) {
    if (aBorrar.has(nodeId)) continue;
    nodes[nodeId] = { ...n, childIds: n.childIds.filter((c) => !aBorrar.has(c)) };
  }

  return { tree: { rootId: tree.rootId, nodes }, cursorId: nodo.parentId };
}

/** La siguiente jugada de la linea en la que estas parado. Si no hay, te quedas donde estas. */
export function siguiente<T>(tree: MoveTree<T>, id: NodeId): NodeId {
  return tree.nodes[id]?.childIds[0] ?? id;
}

/** La jugada anterior. Desde la raiz, la raiz. */
export function anterior<T>(tree: MoveTree<T>, id: NodeId): NodeId {
  return tree.nodes[id]?.parentId ?? tree.rootId;
}

/** El final de la linea ACTUAL, no el de la partida: dentro de una variacion, su ultima jugada. */
export function finDeLinea<T>(tree: MoveTree<T>, id: NodeId): NodeId {
  let actual = id;
  for (;;) {
    const hijo = tree.nodes[actual]?.childIds[0];
    if (!hijo) return actual;
    actual = hijo;
  }
}
