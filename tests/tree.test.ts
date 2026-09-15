import { describe, expect, it } from 'vitest';
import {
  addMove,
  anterior,
  buildFromMainLine,
  deleteSubtree,
  emptyTree,
  finDeLinea,
  isMainLine,
  mainLine,
  nearestMainLine,
  pathTo,
  siguiente,
  uciPath,
} from '@/lib/chess/tree';

/** Una apertura corta como partida de prueba: 1.e4 e5 2.Cf3 Cc6. */
const PARTIDA = [
  { san: 'e4', uci: 'e2e4', datos: { ply: 1 } },
  { san: 'e5', uci: 'e7e5', datos: { ply: 2 } },
  { san: 'Nf3', uci: 'g1f3', datos: { ply: 3 } },
  { san: 'Nc6', uci: 'b8c6', datos: { ply: 4 } },
];

describe('buildFromMainLine', () => {
  it('deja la partida como linea principal, en orden', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(mainLine(tree).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(mainLine(tree).map((n) => n.ply)).toEqual([1, 2, 3, 4]);
  });

  it('cada nodo guarda la posicion DESPUES de su jugada', () => {
    const tree = buildFromMainLine(PARTIDA);
    const primera = mainLine(tree)[0];
    expect(primera?.fen).toContain('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b');
  });

  it('conserva los datos de la partida real en la linea principal', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(mainLine(tree)[2]?.datos).toEqual({ ply: 3 });
  });

  it('una jugada irreproducible corta la construccion ahi, sin inventar posiciones', () => {
    const tree = buildFromMainLine([
      { san: 'e4', uci: 'e2e4', datos: 1 },
      { san: 'Qh8', uci: 'd1h8', datos: 2 },
      { san: 'e5', uci: 'e7e5', datos: 3 },
    ]);
    expect(mainLine(tree).map((n) => n.san)).toEqual(['e4']);
  });

  it('un arbol vacio es solo la posicion inicial', () => {
    expect(mainLine(emptyTree())).toEqual([]);
  });
});

describe('addMove', () => {
  it('crea una variacion desde cualquier nodo sin tocar la linea principal', () => {
    const tree = buildFromMainLine(PARTIDA);
    const traseEp = mainLine(tree)[1]!; // despues de 1.e4 e5
    const res = addMove(tree, traseEp.id, { from: 'f1', to: 'c4' }); // 2.Ac4 en vez de 2.Cf3

    expect(res).not.toBeNull();
    expect(res!.tree.nodes[res!.nodeId]?.san).toBe('Bc4');
    // La principal no cambio: sigue siendo Cf3.
    expect(mainLine(res!.tree).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(isMainLine(res!.tree, res!.nodeId)).toBe(false);
  });

  it('deja mover por el rival tambien: es la posicion la que manda, no de quien sea el turno', () => {
    const tree = buildFromMainLine(PARTIDA);
    const finPartida = mainLine(tree)[3]!; // 2...Cc6, mueven blancas
    const res = addMove(tree, finPartida.id, { from: 'f1', to: 'b5' });
    expect(res?.tree.nodes[res.nodeId]?.san).toBe('Bb5');
  });

  it('DEDUPLICA: re-jugar la jugada que ya esta no crea un hermano identico', () => {
    const tree = buildFromMainLine(PARTIDA);
    const traseE4 = mainLine(tree)[0]!;
    const res = addMove(tree, traseE4.id, { from: 'e7', to: 'e5' });

    expect(res?.nodeId).toBe(mainLine(tree)[1]?.id);
    expect(res?.tree.nodes[traseE4.id]?.childIds).toHaveLength(1);
  });

  it('una jugada ilegal devuelve null en vez de tirar', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(addMove(tree, tree.rootId, { from: 'e2', to: 'e5' })).toBeNull();
    expect(addMove(tree, tree.rootId, { from: 'a1', to: 'z9' })).toBeNull();
  });

  it('un nodo que no existe devuelve null', () => {
    expect(addMove(buildFromMainLine(PARTIDA), 'fantasma', { from: 'e2', to: 'e4' })).toBeNull();
  });

  it('una jugada de variacion no trae datos de la partida: nunca ocurrio', () => {
    const tree = buildFromMainLine(PARTIDA);
    const res = addMove(tree, mainLine(tree)[1]!.id, { from: 'f1', to: 'c4' });
    expect(res?.tree.nodes[res.nodeId]?.datos).toBeNull();
  });

  it('acepta la promocion', () => {
    const tree = emptyTree();
    // Posicion con un peon blanco en a7 a punto de coronar.
    const conPeon = { ...tree, nodes: { ...tree.nodes } };
    conPeon.nodes.raiz = { ...conPeon.nodes.raiz!, fen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1' };
    const res = addMove(conPeon, 'raiz', { from: 'a7', to: 'a8', promotion: 'q' });
    expect(res?.tree.nodes[res.nodeId]?.uci).toBe('a7a8q');
    // Con el rey en e8, coronar en a8 da jaque por la octava fila: el SAN lo refleja.
    expect(res?.tree.nodes[res.nodeId]?.san).toBe('a8=Q+');
  });
});

describe('navegacion', () => {
  it('avanza y retrocede por la linea principal', () => {
    const tree = buildFromMainLine(PARTIDA);
    const [n1, n2] = mainLine(tree);
    expect(siguiente(tree, tree.rootId)).toBe(n1!.id);
    expect(siguiente(tree, n1!.id)).toBe(n2!.id);
    expect(anterior(tree, n2!.id)).toBe(n1!.id);
    expect(anterior(tree, tree.rootId)).toBe(tree.rootId);
  });

  it('al final de la partida, avanzar no se sale del arbol', () => {
    const tree = buildFromMainLine(PARTIDA);
    const ultimo = mainLine(tree)[3]!;
    expect(siguiente(tree, ultimo.id)).toBe(ultimo.id);
  });

  it('dentro de una variacion, avanzar sigue LA VARIACION y no la partida', () => {
    let tree = buildFromMainLine(PARTIDA);
    const traseE5 = mainLine(tree)[1]!;
    const a = addMove(tree, traseE5.id, { from: 'f1', to: 'c4' })!;
    const b = addMove(a.tree, a.nodeId, { from: 'g8', to: 'f6' })!;
    tree = b.tree;

    expect(siguiente(tree, a.nodeId)).toBe(b.nodeId);
    expect(tree.nodes[b.nodeId]?.san).toBe('Nf6');
    // Y el final de la linea es el de la variacion, no el de la partida.
    expect(finDeLinea(tree, a.nodeId)).toBe(b.nodeId);
  });

  it('finDeLinea desde la raiz llega al final de la partida', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(finDeLinea(tree, tree.rootId)).toBe(mainLine(tree)[3]?.id);
  });
});

describe('caminos', () => {
  it('pathTo incluye la raiz y termina en el nodo', () => {
    const tree = buildFromMainLine(PARTIDA);
    const camino = pathTo(tree, mainLine(tree)[2]!.id);
    expect(camino.map((n) => n.san)).toEqual(['', 'e4', 'e5', 'Nf3']);
  });

  it('uciPath da lo que el motor necesita, sin la raiz', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(uciPath(tree, mainLine(tree)[2]!.id)).toEqual(['e2e4', 'e7e5', 'g1f3']);
    expect(uciPath(tree, tree.rootId)).toEqual([]);
  });

  it('nearestMainLine ubica de donde colgo la variacion', () => {
    const tree = buildFromMainLine(PARTIDA);
    const traseE5 = mainLine(tree)[1]!;
    const res = addMove(tree, traseE5.id, { from: 'f1', to: 'c4' })!;
    expect(nearestMainLine(res.tree, res.nodeId)).toBe(traseE5.id);
  });

  it('nearestMainLine de un nodo de la principal es el mismo nodo', () => {
    const tree = buildFromMainLine(PARTIDA);
    const n = mainLine(tree)[2]!;
    expect(nearestMainLine(tree, n.id)).toBe(n.id);
  });
});

describe('deleteSubtree', () => {
  it('borra la variacion entera y deja el cursor en el padre', () => {
    let tree = buildFromMainLine(PARTIDA);
    const traseE5 = mainLine(tree)[1]!;
    const a = addMove(tree, traseE5.id, { from: 'f1', to: 'c4' })!;
    const b = addMove(a.tree, a.nodeId, { from: 'g8', to: 'f6' })!;
    tree = b.tree;

    const res = deleteSubtree(tree, a.nodeId)!;
    expect(res.cursorId).toBe(traseE5.id);
    expect(res.tree.nodes[a.nodeId]).toBeUndefined();
    // El hijo de la variacion tambien se fue: no quedan nodos huerfanos.
    expect(res.tree.nodes[b.nodeId]).toBeUndefined();
    expect(res.tree.nodes[traseE5.id]?.childIds).not.toContain(a.nodeId);
  });

  it('RECHAZA borrar la linea principal: la partida jugada es un hecho', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(deleteSubtree(tree, mainLine(tree)[2]!.id)).toBeNull();
    expect(deleteSubtree(tree, tree.rootId)).toBeNull();
  });

  it('un nodo que no existe devuelve null', () => {
    expect(deleteSubtree(buildFromMainLine(PARTIDA), 'fantasma')).toBeNull();
  });

  it('borrar una variacion no toca la partida', () => {
    const tree = buildFromMainLine(PARTIDA);
    const a = addMove(tree, mainLine(tree)[1]!.id, { from: 'f1', to: 'c4' })!;
    const res = deleteSubtree(a.tree, a.nodeId)!;
    expect(mainLine(res.tree).map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });
});

describe('isMainLine', () => {
  it('distingue la partida de lo que se probo encima', () => {
    const tree = buildFromMainLine(PARTIDA);
    expect(isMainLine(tree, mainLine(tree)[3]!.id)).toBe(true);
    const a = addMove(tree, mainLine(tree)[1]!.id, { from: 'f1', to: 'c4' })!;
    expect(isMainLine(a.tree, a.nodeId)).toBe(false);
    // Un hijo de una variacion tampoco es linea principal, aunque sea el primer hijo de su padre.
    const b = addMove(a.tree, a.nodeId, { from: 'g8', to: 'f6' })!;
    expect(isMainLine(b.tree, b.nodeId)).toBe(false);
  });
});
