'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Clasificacion, cpAPeones } from '@/components/ui';
import { mainLine, type MoveNode, type MoveTree, type NodeId } from '@/lib/chess/tree';
import type { JugadaUI } from '@/components/GameReview';

/** "12." para una jugada de blancas, "12..." para una de negras. */
function numeroDe(ply: number, conPuntos = true): string {
  const numero = Math.ceil(ply / 2);
  if (ply % 2 === 1) return `${numero}.`;
  return conPuntos ? `${numero}...` : '';
}

function evalCorta(datos: JugadaUI | null): string {
  if (!datos || datos.evalCp === null) return '';
  return datos.mateIn !== null ? `M${Math.abs(datos.mateIn)}` : cpAPeones(datos.evalCp);
}

/**
 * Una variacion, en linea y entre parentesis, como en Lichess. Se dibuja recursiva: una
 * variacion puede tener sus propias variaciones dentro.
 *
 * A diferencia de la linea principal, una variacion NO se tabula en dos columnas: es texto que
 * fluye, porque puede empezar en cualquier ply y anidarse a cualquier profundidad. Forzarla a la
 * grilla era lo que hacia ilegible el resultado.
 */
function Variacion({
  tree,
  desdeId,
  cursorId,
  onIr,
  onBorrar,
  nivel,
}: {
  tree: MoveTree<JugadaUI>;
  desdeId: NodeId;
  cursorId: NodeId;
  onIr: (id: NodeId) => void;
  onBorrar: (id: NodeId) => void;
  nivel: number;
}) {
  // La linea de esta variacion: se sigue el primer hijo hasta el final.
  const linea: MoveNode<JugadaUI>[] = [];
  let actual: MoveNode<JugadaUI> | undefined = tree.nodes[desdeId];
  while (actual) {
    linea.push(actual);
    const siguienteId: NodeId | undefined = actual.childIds[0];
    actual = siguienteId ? tree.nodes[siguienteId] : undefined;
  }

  return (
    <div
      className="group/var flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 py-1 pr-2 text-[12.5px] leading-relaxed"
      style={{ paddingLeft: `${8 + nivel * 10}px` }}
    >
      <span className="text-apagado">(</span>
      {linea.map((nodo, i) => (
        <span key={nodo.id} className="flex items-baseline gap-1">
          {nodo.ply % 2 === 1 || i === 0 ? (
            <span className="font-mono text-[11px] text-apagado">{numeroDe(nodo.ply)}</span>
          ) : null}
          <button
            type="button"
            data-node-id={nodo.id}
            onClick={() => onIr(nodo.id)}
            aria-current={nodo.id === cursorId ? 'true' : undefined}
            className={`rounded px-1 font-mono transition-colors ${
              nodo.id === cursorId ? 'bg-acento/20 text-texto' : 'text-tenue hover:text-texto'
            }`}
          >
            {nodo.san}
          </button>
        </span>
      ))}
      <span className="text-apagado">)</span>
      <button
        type="button"
        onClick={() => onBorrar(desdeId)}
        title="Borrar esta variación"
        aria-label="Borrar esta variación"
        className="ml-1 rounded px-1 text-apagado opacity-0 transition-opacity hover:text-critico focus:opacity-100 group-hover/var:opacity-100"
      >
        ×
      </button>

      {/* Sub-variaciones: cualquier nodo de esta linea puede tener alternativas propias. */}
      {linea.flatMap((nodo) =>
        nodo.childIds.slice(1).map((hijoId) => (
          <div key={hijoId} className="w-full">
            <Variacion
              tree={tree}
              desdeId={hijoId}
              cursorId={cursorId}
              onIr={onIr}
              onBorrar={onBorrar}
              nivel={nivel + 1}
            />
          </div>
        )),
      )}
    </div>
  );
}

/**
 * La lista de jugadas: la partida real en dos columnas (blancas / negras), y las variaciones
 * entre parentesis debajo de la jugada de la que cuelgan.
 *
 * Las dos columnas se mantienen porque son lo que hace legible una planilla de 80 jugadas. Las
 * variaciones ocupan una fila entera a lo ancho de las dos columnas, que es como lo resuelven
 * Lichess y chess.com: es lo unico que preserva la grilla sin pelearse con texto que fluye.
 */
export function MoveList({
  tree,
  cursorId,
  onIr,
  onBorrar,
}: {
  tree: MoveTree<JugadaUI>;
  cursorId: NodeId;
  onIr: (id: NodeId) => void;
  onBorrar: (id: NodeId) => void;
}) {
  const principal = mainLine(tree);

  // La lista sigue al cursor. Sin esto, saltar al ply 30 desde el grafico deja la lista en la
  // jugada 1 y hay que buscar a mano donde estas.
  const contenedorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contenedorRef.current
      ?.querySelector(`[data-node-id="${cursorId}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursorId]);

  // Se agrupa de a pares: una fila por numero de jugada.
  const filas: { numero: number; blancas?: MoveNode<JugadaUI>; negras?: MoveNode<JugadaUI> }[] = [];
  for (const nodo of principal) {
    const numero = Math.ceil(nodo.ply / 2);
    let fila = filas[filas.length - 1];
    if (!fila || fila.numero !== numero) {
      fila = { numero };
      filas.push(fila);
    }
    if (nodo.ply % 2 === 1) fila.blancas = nodo;
    else fila.negras = nodo;
  }

  const celda = (nodo: MoveNode<JugadaUI> | undefined): ReactNode => {
    if (!nodo) return <span className="flex-1" />;
    const datos = nodo.datos;
    return (
      <button
        type="button"
        data-node-id={nodo.id}
        onClick={() => onIr(nodo.id)}
        aria-current={nodo.id === cursorId ? 'true' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
          nodo.id === cursorId ? 'bg-acento/15 text-texto' : 'hover:bg-panel-alto'
        }`}
      >
        <span className={`font-mono ${datos?.isMine ? 'text-texto' : 'text-tenue'}`}>{nodo.san}</span>
        <Clasificacion valor={datos?.isMine ? datos.classification : null} soloGlifo />
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-apagado">
          {evalCorta(datos)}
        </span>
      </button>
    );
  };

  return (
    <div ref={contenedorRef} className="max-h-[300px] overflow-y-auto rounded-xl border border-borde">
      <ol className="divide-y divide-borde/60">
        {filas.map((fila) => {
          // Las variaciones de las dos jugadas de esta fila se dibujan debajo de la fila.
          const variaciones = [fila.blancas, fila.negras].flatMap((n) =>
            n ? n.childIds.slice(1).map((id) => ({ id, desde: n })) : [],
          );
          return (
            <li key={fila.numero}>
              <div className="flex items-stretch">
                <span className="flex w-9 shrink-0 items-center bg-panel-alto/60 px-2 font-mono text-[11px] tabular-nums text-apagado">
                  {fila.numero}
                </span>
                {celda(fila.blancas)}
                {celda(fila.negras)}
              </div>
              {variaciones.map((v) => (
                <Variacion
                  key={v.id}
                  tree={tree}
                  desdeId={v.id}
                  cursorId={cursorId}
                  onIr={onIr}
                  onBorrar={onBorrar}
                  nivel={0}
                />
              ))}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
