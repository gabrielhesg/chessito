'use client';

import { defaultPieces, fenStringToPositionObject } from 'react-chessboard';

/**
 * Un tablero chico, solo para mirar: recibe un FEN y lo dibuja.
 *
 * Usa las MISMAS piezas y la MISMA conversion de FEN que el tablero grande
 * (`defaultPieces` y `fenStringToPositionObject`, los dos exportados por `react-chessboard`), asi
 * que la miniatura no puede discrepar de lo que se ve al lado. Antes dibujaba caracteres Unicode
 * y por eso las piezas se veian de otra familia.
 *
 * Lo que NO se usa es el componente `<Chessboard>`: trae drag-and-drop, flechas y un
 * `ResizeObserver` por instancia, y aca se monta y desmonta una miniatura cada vez que el mouse
 * pasa por una jugada.
 */
export function MiniBoard({
  fen,
  orientacion = 'white',
  lado = 168,
  resaltadas = [],
}: {
  fen: string;
  orientacion?: 'white' | 'black';
  /** Lado en pixeles. Multiplo de 8 para que no aparezcan costuras de sub-pixel. */
  lado?: number;
  /** Casillas en notacion algebraica (`e2`, `e4`), para marcar la jugada que se esta mirando. */
  resaltadas?: readonly string[];
}) {
  const posicion = fenStringToPositionObject(fen, 8, 8);

  const filas = orientacion === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const columnas =
    orientacion === 'white'
      ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

  return (
    <div
      className="grid overflow-hidden rounded-md border border-borde"
      style={{
        width: lado,
        height: lado,
        gridTemplateColumns: 'repeat(8, 1fr)',
        // Las filas TAMBIEN van declaradas. Sin esto se auto-dimensionan al contenido, se
        // desbordan del alto fijo y el tablero queda descuadrado — se veia en las miniaturas del
        // panel del motor.
        gridTemplateRows: 'repeat(8, 1fr)',
      }}
      aria-hidden="true"
    >
      {filas.flatMap((fila, indiceFila) =>
        columnas.map((columna, indiceColumna) => {
          const casilla = `${columna}${fila}`;
          const pieza = posicion[casilla];
          const Pieza = pieza ? defaultPieces[pieza.pieceType] : undefined;
          const oscura = (indiceFila + indiceColumna) % 2 === 1;
          return (
            <div
              key={casilla}
              className="relative"
              style={{
                backgroundColor: resaltadas.includes(casilla)
                  ? '#b9ca43'
                  : oscura
                    ? '#769656'
                    : '#eeeed2',
              }}
            >
              {Pieza ? <Pieza /> : null}
            </div>
          );
        }),
      )}
    </div>
  );
}
