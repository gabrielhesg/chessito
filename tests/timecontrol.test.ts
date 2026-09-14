import { describe, expect, it } from 'vitest';
import { formatTimeControl, parseTimeControl } from '@/lib/chess/timecontrol';

describe('parseTimeControl', () => {
  it('parsea "900+10" con incremento', () => {
    expect(parseTimeControl('900+10')).toEqual({ baseSeconds: 900, incrementSecs: 10, isCorrespondence: false });
  });

  it('parsea "600" sin incremento', () => {
    expect(parseTimeControl('600')).toEqual({ baseSeconds: 600, incrementSecs: 0, isCorrespondence: false });
  });

  it('parsea correspondencia "1/86400"', () => {
    expect(parseTimeControl('1/86400')).toEqual({ baseSeconds: 86400, incrementSecs: 0, isCorrespondence: true });
  });

  it('parsea "-" (Play vs Coach) como correspondencia', () => {
    expect(parseTimeControl('-')).toEqual({ baseSeconds: 0, incrementSecs: 0, isCorrespondence: true });
  });

  it('lanza sobre un formato no reconocido', () => {
    expect(() => parseTimeControl('abc')).toThrow('time_control no reconocido');
  });
});

describe('formatTimeControl', () => {
  it('bullet con incremento: "120+1" -> "2+1"', () => {
    expect(formatTimeControl('120+1')).toBe('2+1');
  });

  it('blitz con incremento: "300+3" -> "5+3"', () => {
    expect(formatTimeControl('300+3')).toBe('5+3');
  });

  it('rapid sin incremento: "600" -> "10 min"', () => {
    expect(formatTimeControl('600')).toBe('10 min');
  });

  it('bullet fraccionario sin incremento: "60" -> "1 min"', () => {
    expect(formatTimeControl('60')).toBe('1 min');
  });

  it('base en segundos que no cae en un minuto exacto: "30" -> "0.5 min"', () => {
    expect(formatTimeControl('30')).toBe('0.5 min');
  });

  it('correspondencia real: "1/86400" -> "correspondencia"', () => {
    expect(formatTimeControl('1/86400')).toBe('correspondencia');
  });

  it('Play vs Coach: "-" -> "vs coach"', () => {
    expect(formatTimeControl('-')).toBe('vs coach');
  });
});
