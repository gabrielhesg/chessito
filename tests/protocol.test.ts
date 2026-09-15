import { describe, expect, it } from 'vitest';
import { parseBestmove, parseIdName, parseInfo, splitLines } from '@/lib/engine/protocol';

describe('splitLines', () => {
  it('parte en lineas completas y guarda lo que quedo a medias', () => {
    expect(splitLines('uciok\nreadyok\ninfo dep', '')).toEqual({
      lines: ['uciok', 'readyok'],
      carry: 'info dep',
    });
  });

  it('continua desde lo que quedo pendiente: un chunk no termina donde termina una linea', () => {
    const uno = splitLines('info dep', '');
    const dos = splitLines('th 20 score cp 5 pv e2e4\n', uno.carry);
    expect(dos.lines).toEqual(['info depth 20 score cp 5 pv e2e4']);
    expect(dos.carry).toBe('');
  });

  it('tolera el retorno de carro de Windows', () => {
    expect(splitLines('uciok\r\n', '').lines).toEqual(['uciok']);
  });

  it('un chunk sin ningun salto de linea no emite nada todavia', () => {
    expect(splitLines('parcial', '')).toEqual({ lines: [], carry: 'parcial' });
  });
});

describe('parseInfo', () => {
  it('lee profundidad, score y linea principal', () => {
    const info = parseInfo('info depth 20 seldepth 28 multipv 1 score cp 34 nodes 1000 pv e2e4 e7e5 g1f3');
    expect(info).toEqual({
      depth: 20,
      multipv: 1,
      scoreCp: 34,
      mateIn: null,
      tieneScore: true,
      pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });

  it('un mate anula el score en centipeones, no convive con el', () => {
    const info = parseInfo('info depth 12 score mate -3 pv e2e4');
    expect(info?.mateIn).toBe(-3);
    expect(info?.scoreCp).toBeNull();
  });

  it('una linea sin multipv es la linea 1', () => {
    expect(parseInfo('info depth 5 score cp 10 pv e2e4')?.multipv).toBe(1);
    expect(parseInfo('info depth 5 multipv 3 score cp 10 pv e2e4')?.multipv).toBe(3);
  });

  it('distingue "sin score" de "score 0": es lo que evita perder la evaluacion mas profunda', () => {
    const soloPv = parseInfo('info depth 4 pv e2e4');
    expect(soloPv?.tieneScore).toBe(false);
    expect(soloPv?.pv).toEqual(['e2e4']);

    const cero = parseInfo('info depth 4 score cp 0 pv e2e4');
    expect(cero?.tieneScore).toBe(true);
    expect(cero?.scoreCp).toBe(0);
  });

  it('una linea con score y sin pv sigue sirviendo: el motor manda varias asi', () => {
    const info = parseInfo('info depth 1 seldepth 1 score cp 20 nodes 20 nps 20000');
    expect(info?.tieneScore).toBe(true);
    expect(info?.pv).toBeNull();
  });

  it('descarta lo que no aporta ni score ni linea', () => {
    expect(parseInfo('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('uciok')).toBeNull();
  });

  it('filtra de la pv lo que no tenga forma de jugada', () => {
    expect(parseInfo('info score cp 5 pv e2e4 basura e7e5')?.pv).toEqual(['e2e4', 'e7e5']);
  });

  it('acepta la promocion en la pv', () => {
    expect(parseInfo('info score cp 5 pv a7a8q')?.pv).toEqual(['a7a8q']);
  });
});

describe('parseBestmove', () => {
  it('lee la jugada e ignora el ponder', () => {
    expect(parseBestmove('bestmove e2e4 ponder e7e5')).toEqual({ bestUci: 'e2e4' });
  });

  it('"(none)" se normaliza a null: es jaque mate o ahogado, no hay jugada mejor', () => {
    // Trampa 6 de CLAUDE.md: "(none)" son 6 caracteres y reventaba `moves.best_uci varchar(5)`.
    expect(parseBestmove('bestmove (none)')).toEqual({ bestUci: null });
  });

  it('una linea que no es bestmove devuelve null', () => {
    expect(parseBestmove('info depth 2 score cp 5 pv e2e4')).toBeNull();
  });
});

describe('parseIdName', () => {
  it('extrae el nombre del motor, que es de donde sale engine_id', () => {
    expect(parseIdName('id name Stockfish 16.1')).toBe('Stockfish 16.1');
  });

  it('otras lineas no son el nombre', () => {
    expect(parseIdName('id author los de siempre')).toBeNull();
    expect(parseIdName('uciok')).toBeNull();
  });
});
