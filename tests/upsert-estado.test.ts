import { describe, expect, it } from 'vitest';
import { sinColumnasDeEstado } from '@/lib/ingest/columnas';
import type { GameRow } from '@/lib/chess/game';

/**
 * El invariante: **reingerir una partida ya analizada no puede borrar su analisis.**
 *
 * `runIngest` reingiere el archivo mensual completo, no solo lo nuevo, asi que cada corrida pasa
 * por encima de partidas que el motor ya proceso. `PgIngestStore` lo respeta excluyendo las dos
 * columnas de su lista de update; `SupabaseIngestStore` mandaba la fila entera y las pisaba.
 *
 * El transporte de PostgREST no se puede levantar en un test (no hay servidor), asi que lo que se
 * fija aca es la pieza que decide: que columnas se quitan y cuales sobreviven. Si alguien vuelve
 * al upsert de una sola llamada, este test no lo atrapa — por eso el comentario del metodo
 * explica el porque y no solo el que.
 */
const FILA: GameRow = {
  chesscom_uuid: 'uuid-1',
  url: 'https://example.test/1',
  end_time: '2026-09-01T12:00:00Z',
  time_class: 'rapid',
  time_control: '600',
  base_seconds: 600,
  increment_secs: 0,
  rules: 'chess',
  my_color: 'white',
  my_rating: 1250,
  opp_rating: 1260,
  opp_username: 'rival',
  result: 'loss',
  score: 0,
  termination: 'resigned',
  my_accuracy: null,
  opening_id: null,
  opening_eco_cc: null,
  opening_url_cc: null,
  ply_count: 40,
  pgn: '1. e4 e5',
  analysis_state: 'pending',
  skip_reason: null,
  rated: true,
};

describe('sinColumnasDeEstado', () => {
  it('quita el estado del analisis, que es lo que no puede pisarse al reingerir', () => {
    const resultado = sinColumnasDeEstado(FILA) as Record<string, unknown>;
    expect('analysis_state' in resultado).toBe(false);
    expect('skip_reason' in resultado).toBe(false);
  });

  it('conserva TODO lo demas, incluido `rated`, que si es dato de la partida', () => {
    const resultado = sinColumnasDeEstado(FILA) as Record<string, unknown>;
    // `rated` viene del JSON de chess.com y puede corregirse entre ingestas: es dato, no estado.
    expect(resultado['rated']).toBe(true);
    expect(resultado['my_rating']).toBe(1250);
    expect(resultado['pgn']).toBe('1. e4 e5');
    expect(Object.keys(resultado)).toHaveLength(Object.keys(FILA).length - 2);
  });

  it('no muta la fila original', () => {
    sinColumnasDeEstado(FILA);
    expect(FILA.analysis_state).toBe('pending');
    expect(FILA.skip_reason).toBeNull();
  });
});
