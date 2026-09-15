/**
 * El protocolo UCI, puro: recibe texto, devuelve datos. Cero imports, ni de `node:` ni del
 * navegador.
 *
 * Esta separado del transporte porque el protocolo es el mismo hable con un binario nativo por
 * stdin/stdout (GitHub Actions) o con un Stockfish WASM dentro de un Web Worker (el navegador).
 * Es la misma regla que ya aplica `lib/ingest/store.ts`: una logica, dos transportes, nunca la
 * logica duplicada.
 *
 * Que este archivo no importe nada tambien es lo que impide que el build de cliente arrastre
 * `node:child_process`, que es lo que pasaria si el navegador alcanzara `uci.ts`.
 */

/**
 * Parte un chunk de stdout en lineas completas, devolviendo lo que quedo a medias para la
 * proxima vuelta. Un proceso nativo no garantiza que un chunk termine en `\n`.
 */
export function splitLines(chunk: string, carry: string): { lines: string[]; carry: string } {
  const texto = carry + chunk;
  const partes = texto.split('\n');
  // El ultimo pedazo no termino en \n: queda pendiente.
  const resto = partes.pop() ?? '';
  return { lines: partes.map((l) => l.replace(/\r$/, '')), carry: resto };
}

export type InfoParsed = {
  /** Profundidad alcanzada. null si la linea no la trae. */
  depth: number | null;
  /** Indice de MultiPV, 1 = mejor linea. Una linea sin `multipv` es la 1. */
  multipv: number;
  /** Centipeones EN PERSPECTIVA DEL QUE MUEVE (crudo de UCI). Normalizar es de lib/analysis/. */
  scoreCp: number | null;
  mateIn: number | null;
  /** true si la linea traia algun `score`. Sin esto no se puede distinguir "score 0" de "sin score". */
  tieneScore: boolean;
  /** Linea principal completa. null si esta linea no trae `pv`. */
  pv: string[] | null;
};

/**
 * En UCI, `pv` es SIEMPRE el ultimo campo de la linea, asi que todo lo que viene despues son
 * jugadas. El filtro por forma de jugada descarta la basura de motores que agregan campos.
 */
function extraerPv(line: string): string[] | null {
  const marca = / pv /.exec(line);
  if (!marca) return null;
  const jugadas = line
    .slice(marca.index + marca[0].length)
    .trim()
    .split(/\s+/)
    .filter((jugada) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(jugada));
  return jugadas.length > 0 ? jugadas : null;
}

/**
 * Parsea una linea `info`. Devuelve null si no aporta nada (ni score ni pv), para que quien
 * llama pueda ignorarla sin preguntar.
 *
 * `score` y `pv` se devuelven por separado a proposito: el motor manda lineas con score y sin
 * pv (por ejemplo `info depth 1 seldepth 1 ... score cp 20`), y quedarse solo con las que traen
 * las dos cosas perderia la evaluacion mas profunda.
 */
export function parseInfo(line: string): InfoParsed | null {
  const mateMatch = /score mate (-?\d+)/.exec(line);
  const cpMatch = /score cp (-?\d+)/.exec(line);
  const pv = extraerPv(line);
  const tieneScore = mateMatch !== null || cpMatch !== null;
  if (!tieneScore && pv === null) return null;

  const depthMatch = /\bdepth (\d+)/.exec(line);
  const multipvMatch = /multipv (\d+)/.exec(line);

  return {
    depth: depthMatch?.[1] ? Number.parseInt(depthMatch[1], 10) : null,
    multipv: multipvMatch?.[1] ? Number.parseInt(multipvMatch[1], 10) : 1,
    scoreCp: cpMatch?.[1] && !mateMatch ? Number.parseInt(cpMatch[1], 10) : null,
    mateIn: mateMatch?.[1] ? Number.parseInt(mateMatch[1], 10) : null,
    tieneScore,
    pv,
  };
}

/**
 * Parsea `bestmove e2e4 ponder e7e5`. Devuelve null si la linea no es un bestmove.
 *
 * `(none)` se normaliza a null: es lo que responde el motor cuando la posicion no tiene jugadas
 * legales (jaque mate o ahogado). Son 6 caracteres y no caben en `moves.best_uci varchar(5)` —
 * esto reventó en produccion en 89 de 500 partidas del primer backfill (trampa 6 de CLAUDE.md).
 */
export function parseBestmove(line: string): { bestUci: string | null } | null {
  if (!line.startsWith('bestmove')) return null;
  const crudo = line.split(/\s+/)[1] ?? '';
  return { bestUci: crudo === '(none)' || crudo === '' ? null : crudo };
}

/** `id name Stockfish 16.1` -> `Stockfish 16.1`. null si la linea no es esa. */
export function parseIdName(line: string): string | null {
  const match = /^id name (.+)$/.exec(line);
  return match?.[1]?.trim() ?? null;
}
