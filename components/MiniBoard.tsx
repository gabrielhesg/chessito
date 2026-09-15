/**
 * Un tablero chico, solo para mirar: recibe un FEN y lo dibuja.
 *
 * No usa `react-chessboard` a proposito. Ese componente trae drag-and-drop, flechas y un
 * `ResizeObserver` por instancia, y aca se montan varias miniaturas a la vez en un popover que
 * aparece y desaparece. Esto son 64 divs y un caracter Unicode por pieza.
 *
 * Es presentacion pura y sin estado: la validacion de la posicion ya la hizo `chess.js` aguas
 * arriba, aca solo se lee el campo de piezas del FEN.
 */

const PIEZAS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

/**
 * El campo de piezas del FEN a 64 casillas, de a8 a h1. Un FEN corto o corrupto devuelve las
 * casillas que alcance y rellena el resto vacias: una miniatura incompleta es mejor que tirar.
 */
export function casillasDesdeFen(fen: string): string[] {
  const filas = (fen.split(' ')[0] ?? '').split('/');
  const casillas: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    const fila = filas[i] ?? '';
    const deLaFila: string[] = [];
    for (const caracter of fila) {
      const vacias = Number.parseInt(caracter, 10);
      if (Number.isNaN(vacias)) deLaFila.push(caracter);
      else for (let j = 0; j < vacias; j += 1) deLaFila.push('');
    }
    for (let c = 0; c < 8; c += 1) casillas.push(deLaFila[c] ?? '');
  }
  return casillas;
}

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
  const casillas = casillasDesdeFen(fen);
  // Los indices van de a8 a h1; con negras abajo se recorre al reves.
  const orden = orientacion === 'white' ? casillas : [...casillas].reverse();

  return (
    <div
      className="grid overflow-hidden rounded-md border border-borde"
      style={{ width: lado, height: lado, gridTemplateColumns: 'repeat(8, 1fr)' }}
      aria-hidden="true"
    >
      {orden.map((pieza, indice) => {
        const real = orientacion === 'white' ? indice : 63 - indice;
        const columna = real % 8;
        const fila = Math.floor(real / 8);
        const nombre = `${'abcdefgh'[columna]}${8 - fila}`;
        const oscura = (columna + fila) % 2 === 1;
        return (
          <div
            key={nombre}
            className="flex items-center justify-center leading-none"
            style={{
              backgroundColor: resaltadas.includes(nombre)
                ? '#b9ca43'
                : oscura
                  ? '#769656'
                  : '#eeeed2',
              fontSize: lado / 9,
              // Las piezas blancas de Unicode son huecas y se pierden sobre la casilla clara: el
              // contorno oscuro es lo que las hace legibles a este tamano.
              color: pieza === pieza.toUpperCase() ? '#ffffff' : '#111111',
              textShadow: pieza === pieza.toUpperCase() ? '0 0 1.5px #000' : 'none',
            }}
          >
            {PIEZAS[pieza] ?? ''}
          </div>
        );
      })}
    </div>
  );
}
