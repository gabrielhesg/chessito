import { describe, expect, it } from 'vitest';
import { JUGADAS_PROPIAS_MAXIMAS, lineaAReproducir } from '@/lib/puzzles/solucion';

/**
 * El bug que este archivo existe para que no vuelva: el entrenador pedía reproducir el PV
 * completo del motor, con mediana de 19 plies. Eso son diez jugadas propias seguidas en el orden
 * exacto de Stockfish.
 *
 * Ningún test lo atrapó en su momento porque todos probaban que comparar jugada contra jugada
 * funciona — y funcionaba. Lo que estaba mal era cuántas jugadas se piden, que no lo probaba
 * nadie.
 */
describe('lineaAReproducir', () => {
  // La línea real del ejercicio 17, el que se falló 11 veces en una semana.
  const ejercicio17 = [
    'd8b8', 'g3f5', 'd7c5', 'f5e7', 'g8h8', 'd3d1', 'b8e5', 'f1f3', 'c5e4', 'e7c6', 'e5g5',
  ];

  it('acota a tres jugadas propias, que son cinco plies', () => {
    const linea = lineaAReproducir(ejercicio17, 'd8b8');
    expect(linea).toEqual(['d8b8', 'g3f5', 'd7c5', 'f5e7', 'g8h8']);
    // Las propias son las de índice par: tres.
    expect(linea.filter((_, i) => i % 2 === 0)).toHaveLength(JUGADAS_PROPIAS_MAXIMAS);
  });

  it('una línea corta se deja entera, no se rellena', () => {
    expect(lineaAReproducir(['d8b8', 'g3f5'], 'd8b8')).toEqual(['d8b8', 'g3f5']);
  });

  it('sin línea guardada, el ejercicio es la jugada suelta', () => {
    expect(lineaAReproducir(null, 'd8b8')).toEqual(['d8b8']);
    expect(lineaAReproducir([], 'd8b8')).toEqual(['d8b8']);
  });

  it('nunca devuelve una línea vacía, ni con un máximo absurdo', () => {
    // Un 0 o un negativo dejaría un ejercicio que no se puede resolver: siempre queda la jugada.
    expect(lineaAReproducir(ejercicio17, 'd8b8', 0)).toEqual(['d8b8']);
    expect(lineaAReproducir(ejercicio17, 'd8b8', -3)).toEqual(['d8b8']);
  });

  it('el máximo es configurable, porque el largo correcto es una decisión de producto', () => {
    expect(lineaAReproducir(ejercicio17, 'd8b8', 1)).toEqual(['d8b8']);
    expect(lineaAReproducir(ejercicio17, 'd8b8', 2)).toEqual(['d8b8', 'g3f5', 'd7c5']);
  });

  it('no muta la línea original, que el panel de explicación sigue usando entera', () => {
    const original = [...ejercicio17];
    lineaAReproducir(ejercicio17, 'd8b8');
    expect(ejercicio17).toEqual(original);
    expect(ejercicio17).toHaveLength(11);
  });
});
