/**
 * Mapeo de una partida del JSON de chess.com a una fila de `games`.
 *
 * Puro y testeable sin base de datos (docs/ENGINEERING.md seccion 2).
 */
import type { ChesscomGame } from './chesscom';
import { parseTimeControl } from './timecontrol';
import { parsePgn } from './pgn';
import { resolveOpening } from './openings';

export type GameColor = 'white' | 'black';
export type GameResult = 'win' | 'loss' | 'draw';
export type AnalysisState = 'pending' | 'claimed' | 'done' | 'failed' | 'skipped';

/**
 * Enum estable de `white.result` / `black.result`. Se usa este y NO el header `Termination`
 * del PGN, que es prosa en ingles y cambia de formato (docs/DATA-SOURCES.md).
 */
const DRAW_RESULTS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

export function resultFromTermination(termination: string): GameResult {
  if (termination === 'win') return 'win';
  if (DRAW_RESULTS.has(termination)) return 'draw';
  return 'loss';
}

export function scoreOf(result: GameResult): number {
  if (result === 'win') return 1;
  if (result === 'draw') return 0.5;
  return 0;
}

export type GameRow = {
  chesscom_uuid: string;
  url: string;
  end_time: string;
  time_class: string;
  time_control: string;
  base_seconds: number;
  increment_secs: number;
  rules: string;
  my_color: GameColor;
  my_rating: number;
  opp_rating: number;
  opp_username: string;
  result: GameResult;
  score: number;
  termination: string;
  my_accuracy: number | null;
  opening_id: string | null;
  opening_eco_cc: string | null;
  opening_url_cc: string | null;
  ply_count: number;
  pgn: string;
  analysis_state: AnalysisState;
};

export type MapGameOptions = {
  username: string;
  /** epd -> apertura. Vacio si aun no se cargaron las aperturas. */
  openingsByEpd: ReadonlyMap<string, { id: string; plyCount: number }>;
};

export class GameMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameMappingError';
  }
}

/**
 * Convierte una partida de la API en una fila de `games`.
 * Lanza `GameMappingError` si la partida no es utilizable; quien llama la registra con su id
 * y su motivo y sigue con la siguiente (resistencia a fallas parciales).
 */
export function mapGame(game: ChesscomGame, options: MapGameOptions): GameRow {
  const username = options.username.toLowerCase();
  const isWhite = game.white.username.toLowerCase() === username;
  const isBlack = game.black.username.toLowerCase() === username;
  if (!isWhite && !isBlack) {
    throw new GameMappingError(`La partida ${game.uuid} no es de ${options.username}`);
  }

  const pgn = game.pgn;
  if (!pgn || pgn.trim() === '') {
    throw new GameMappingError(`La partida ${game.uuid} no trae PGN`);
  }

  const mySide = isWhite ? game.white : game.black;
  const oppSide = isWhite ? game.black : game.white;
  const myColor: GameColor = isWhite ? 'white' : 'black';

  const timeControl = parseTimeControl(game.time_control);
  const isChess = game.rules === 'chess';
  // Las variantes (chess960, bughouse...) no se reproducen con chess.js y no se analizan:
  // se guardan crudas y marcadas 'skipped'.
  const parsed = isChess ? parsePgn(pgn) : null;
  const analysisState: AnalysisState =
    !isChess || timeControl.isCorrespondence || game.time_class === 'daily' ? 'skipped' : 'pending';

  const opening = parsed ? resolveOpening(parsed.epds, options.openingsByEpd) : null;
  const result = resultFromTermination(mySide.result);
  const accuracy = isWhite ? game.accuracies?.white : game.accuracies?.black;
  const ecoHeader = parsed?.headers['ECO'];

  return {
    chesscom_uuid: game.uuid,
    url: game.url,
    end_time: new Date(game.end_time * 1000).toISOString(),
    time_class: game.time_class,
    time_control: game.time_control,
    base_seconds: timeControl.baseSeconds,
    increment_secs: timeControl.incrementSecs,
    rules: game.rules,
    my_color: myColor,
    my_rating: mySide.rating,
    opp_rating: oppSide.rating,
    opp_username: oppSide.username,
    result,
    score: scoreOf(result),
    // El resultado de GABRIEL, no el del rival. /reloj necesita distinguir sus 'timeout'.
    termination: mySide.result,
    my_accuracy: accuracy ?? null,
    opening_id: opening?.openingId ?? null,
    opening_eco_cc: ecoHeader && /^[A-E]\d{2}$/.test(ecoHeader) ? ecoHeader : null,
    opening_url_cc: game.eco ?? null,
    ply_count: parsed?.moves.length ?? 0,
    pgn,
    analysis_state: analysisState,
  };
}
