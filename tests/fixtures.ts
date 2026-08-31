import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChesscomGame } from '@/lib/chess/chesscom';

const DIR = join(process.cwd(), 'tests/fixtures');

export type Expected = {
  chesscom_uuid: string;
  my_color: 'white' | 'black';
  result: 'win' | 'loss' | 'draw';
  score: number;
  termination: string;
  opp_username: string;
  time_control: string;
  base_seconds: number;
  increment_secs: number;
  is_correspondence: boolean;
  analysis_state: string;
  ply_count: number;
  has_clk: boolean;
  n_clocks: number;
  first_clock_ms: number | null;
  last_clock_ms: number | null;
  move_times_ms_first_6: number[];
  max_move_time_ms: number | null;
  min_move_time_ms: number | null;
  primeras_jugadas?: string;
  apertura_esperada?: string;
};

export type Fixture = {
  name: string;
  pgn: string;
  game: ChesscomGame;
  expected: Expected;
};

export const FIXTURE_NAMES = [
  'rapid-15-10-con-clk',
  'rapid-10-0-sin-incremento',
  'correspondencia-1-259200',
  'sin-reloj-vs-coach',
  'ganada-por-tiempo',
  'ponziani-por-transposicion',
] as const;

export function loadFixture(name: string): Fixture {
  const pgn = readFileSync(join(DIR, `${name}.pgn`), 'utf8');
  const meta = JSON.parse(readFileSync(join(DIR, `${name}.game.json`), 'utf8')) as Omit<
    ChesscomGame,
    'pgn'
  >;
  const expected = JSON.parse(readFileSync(join(DIR, `${name}.expected.json`), 'utf8')) as Expected;
  return { name, pgn, game: { ...meta, pgn }, expected };
}

export function allFixtures(): Fixture[] {
  return FIXTURE_NAMES.map(loadFixture);
}

export const USERNAME = 'gabrielhesg';
