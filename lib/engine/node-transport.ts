/**
 * El transporte de Node: un binario de Stockfish como proceso hijo, por stdin/stdout.
 *
 * Este es el UNICO archivo de `lib/engine/` que importa `node:child_process`. Si el codigo del
 * navegador alcanzara este modulo, el build de cliente se caeria — por eso la separacion no es
 * estetica, es estructural.
 *
 * `spawnFn` es inyectable, igual que `ChesscomClient.fetchImpl` (lib/chess/chesscom.ts): en
 * produccion levanta el proceso real, en los tests recibe un "motor simulado" que responde
 * lineas UCI guionadas, sin depender de que el binario este instalado.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { splitLines } from '@/lib/engine/protocol';
import type { UciTransport } from '@/lib/engine/transport';

export type EngineProcess = {
  stdin: { write(data: string): void };
  stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): void };
  kill(): void;
};

export type SpawnFn = (enginePath: string) => EngineProcess;

export const defaultSpawn: SpawnFn = (enginePath) =>
  nodeSpawn(enginePath, [], { stdio: ['pipe', 'pipe', 'ignore'] });

export function createNodeTransport(enginePath: string, spawnFn: SpawnFn = defaultSpawn): UciTransport {
  const proceso = spawnFn(enginePath);
  let carry = '';
  let escuchando = false;

  return {
    send(command) {
      proceso.stdin.write(`${command}\n`);
    },
    onLine(listener) {
      if (escuchando) return;
      escuchando = true;
      // Un chunk de stdout no termina necesariamente en \n: `splitLines` guarda lo que quedo a
      // medias para la proxima vuelta.
      proceso.stdout.on('data', (chunk) => {
        const { lines, carry: resto } = splitLines(chunk.toString(), carry);
        carry = resto;
        for (const line of lines) listener(line);
      });
    },
    dispose() {
      proceso.kill();
    },
  };
}
