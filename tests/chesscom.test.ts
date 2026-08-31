import { describe, expect, it } from 'vitest';
import {
  backoffMs,
  ChesscomClient,
  ChesscomError,
  chesscomGameSchema,
  monthKey,
} from '@/lib/chess/chesscom';
import { loadFixture } from './fixtures';

type Call = { url: string; at: number };

function fakeFetch(responses: (() => Response)[], calls: Call[]) {
  let index = 0;
  return (url: string): Promise<Response> => {
    calls.push({ url, at: index });
    const make = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!make) throw new Error('sin respuesta preparada');
    return Promise.resolve(make());
  };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

describe('validacion Zod en el borde', () => {
  it('acepta una partida real de chess.com', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    expect(() => chesscomGameSchema.parse(fixture.game)).not.toThrow();
  });

  it('rechaza un contrato roto en vez de dejarlo entrar', () => {
    const fixture = loadFixture('rapid-15-10-con-clk');
    const roto = { ...fixture.game, end_time: 'ayer' };
    expect(() => chesscomGameSchema.parse(roto)).toThrow();
  });
});

describe('ChesscomClient', () => {
  it('lista los archivos en orden cronologico', async () => {
    const calls: Call[] = [];
    const client = new ChesscomClient({
      username: 'GabrielHesg',
      fetchImpl: fakeFetch(
        [
          () =>
            json({
              archives: [
                'https://api.chess.com/pub/player/gabrielhesg/games/2026/01',
                'https://api.chess.com/pub/player/gabrielhesg/games/2024/12',
              ],
            }),
        ],
        calls,
      ),
      sleep: () => Promise.resolve(),
    });
    const archives = await client.listArchives();
    expect(archives.map(monthKey)).toEqual(['2024-12', '2026-01']);
    // El usuario va en minusculas: la API rechaza la capitalizacion de la persona.
    expect(calls[0]?.url).toContain('/player/gabrielhesg/');
  });

  it('respeta el 429 y reintenta', async () => {
    const calls: Call[] = [];
    const waits: number[] = [];
    const client = new ChesscomClient({
      username: 'gabrielhesg',
      fetchImpl: fakeFetch(
        [
          () => json({ code: 0 }, 429, { 'retry-after': '2' }),
          () => json({ archives: ['https://api.chess.com/pub/player/gabrielhesg/games/2026/08'] }),
        ],
        calls,
      ),
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    const archives = await client.listArchives();
    expect(archives).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]); // honra Retry-After, no su propio backoff
  });

  it('reintenta los 5xx con backoff exponencial y se rinde al tercer intento', async () => {
    const calls: Call[] = [];
    const waits: number[] = [];
    const client = new ChesscomClient({
      username: 'gabrielhesg',
      fetchImpl: fakeFetch([() => json({}, 503)], calls),
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    await expect(client.listArchives()).rejects.toBeInstanceOf(ChesscomError);
    expect(calls).toHaveLength(3);
    // Tres intentos, dos esperas: despues del ultimo no queda nada que esperar.
    expect(waits).toEqual([500, 1000]);
  });

  it('no reintenta un 404', async () => {
    const calls: Call[] = [];
    const client = new ChesscomClient({
      username: 'no-existe',
      fetchImpl: fakeFetch([() => json({}, 404)], calls),
      sleep: () => Promise.resolve(),
    });
    await expect(client.listArchives()).rejects.toThrow(/404/);
    expect(calls).toHaveLength(1);
  });

  it('backoffMs crece exponencialmente', () => {
    expect([backoffMs(1), backoffMs(2), backoffMs(3)]).toEqual([500, 1000, 2000]);
  });

  it('listMonth valida y devuelve las partidas del mes', async () => {
    const fixture = loadFixture('rapid-10-0-sin-incremento');
    const calls: Call[] = [];
    const client = new ChesscomClient({
      username: 'gabrielhesg',
      fetchImpl: fakeFetch([() => json({ games: [fixture.game] })], calls),
      sleep: () => Promise.resolve(),
    });
    const games = await client.listMonth({ year: 2024, month: 10 });
    expect(games).toHaveLength(1);
    expect(games[0]?.uuid).toBe(fixture.expected.chesscom_uuid);
    expect(calls[0]?.url).toContain('/games/2024/10');
  });
});
