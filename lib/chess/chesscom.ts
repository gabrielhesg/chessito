/**
 * Cliente de la API publica de chess.com.
 *
 * Reglas que vienen de docs/DATA-SOURCES.md y no son negociables:
 *  - FETCH SERIAL. La documentacion dice que el acceso serial es ilimitado; el paralelo
 *    recibe 429. Nunca `Promise.all` sobre los archivos mensuales.
 *  - Reintento con backoff exponencial, maximo 3 intentos, y respeto explicito del 429
 *    (se honra `Retry-After` cuando viene).
 *  - Todo lo que entra se valida con Zod. Un cambio de contrato tiene que fallar con un
 *    mensaje claro, no corromper la base en silencio.
 */
import { z } from 'zod';

export const playerSideSchema = z.object({
  rating: z.number(),
  result: z.string(),
  username: z.string(),
  uuid: z.string().optional(),
  '@id': z.string().optional(),
});

export const chesscomGameSchema = z.object({
  url: z.string(),
  uuid: z.string(),
  pgn: z.string().optional(),
  time_control: z.string(),
  time_class: z.string(),
  rules: z.string(),
  end_time: z.number(),
  rated: z.boolean().optional(),
  fen: z.string().optional(),
  eco: z.string().optional(),
  accuracies: z.object({ white: z.number(), black: z.number() }).partial().optional(),
  white: playerSideSchema,
  black: playerSideSchema,
});

export const archivesSchema = z.object({ archives: z.array(z.string()) });
export const monthSchema = z.object({ games: z.array(chesscomGameSchema) });

export type ChesscomGame = z.infer<typeof chesscomGameSchema>;

/** Un archivo mensual: `{ year: 2026, month: 8 }`, en UTC, como lo corta chess.com. */
export type ArchiveMonth = { year: number; month: number };

const BASE = 'https://api.chess.com/pub';
const USER_AGENT = 'chessito/1.0 (app personal de analisis; +https://github.com/gabrielhesg/chessito)';
const MAX_ATTEMPTS = 3;

export class ChesscomError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ChesscomError';
  }
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

export type ChesscomClientOptions = {
  username: string;
  fetchImpl?: FetchLike;
  /** Inyectable para que los tests no duerman de verdad. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ChesscomClient {
  private readonly username: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: ChesscomClientOptions) {
    this.username = options.username.toLowerCase();
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** GET con reintentos. Serial por construccion: cada llamada espera a la anterior. */
  private async getJson(url: string): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      } catch (error) {
        lastError = new ChesscomError(
          `Error de red pidiendo ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
        await this.backoff(attempt);
        continue;
      }

      if (response.status === 429) {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
        lastError = new ChesscomError(`429 Too Many Requests en ${url}`, 429);
        if (attempt < MAX_ATTEMPTS) {
          await this.sleep(
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt),
          );
        }
        continue;
      }

      if (response.status >= 500) {
        lastError = new ChesscomError(`${response.status} de chess.com en ${url}`, response.status);
        await this.backoff(attempt);
        continue;
      }

      if (!response.ok) {
        // 404 y demas errores del cliente no se reintentan: no van a mejorar.
        throw new ChesscomError(`${response.status} de chess.com en ${url}`, response.status);
      }

      return (await response.json()) as unknown;
    }

    throw lastError ?? new ChesscomError(`No se pudo obtener ${url}`);
  }

  /** No duerme despues del ultimo intento: ahi ya no queda nada que esperar. */
  private async backoff(attempt: number): Promise<void> {
    if (attempt >= MAX_ATTEMPTS) return;
    await this.sleep(backoffMs(attempt));
  }

  /** Lista completa de meses con partidas, en orden cronologico. */
  async listArchives(): Promise<ArchiveMonth[]> {
    const data = await this.getJson(`${BASE}/player/${this.username}/games/archives`);
    const parsed = archivesSchema.parse(data);
    return parsed.archives
      .map((url) => {
        const match = /\/(\d{4})\/(\d{2})$/.exec(url);
        if (!match?.[1] || !match[2]) throw new ChesscomError(`URL de archivo inesperada: ${url}`);
        return { year: Number.parseInt(match[1], 10), month: Number.parseInt(match[2], 10) };
      })
      .sort((a, b) => a.year - b.year || a.month - b.month);
  }

  /** Partidas de un mes UTC. */
  async listMonth({ year, month }: ArchiveMonth): Promise<ChesscomGame[]> {
    const mm = String(month).padStart(2, '0');
    const data = await this.getJson(`${BASE}/player/${this.username}/games/${year}/${mm}`);
    return monthSchema.parse(data).games;
  }
}

export function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

/** `{ year, month }` a la clave `YYYY-MM` con la que se agrupa la reconciliacion. */
export function monthKey({ year, month }: ArchiveMonth): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
