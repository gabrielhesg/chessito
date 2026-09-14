import 'server-only';
import { env } from '@/lib/env';

const OWNER = 'gabrielhesg';
const REPO = 'chessito';

/**
 * Dispara un workflow de GitHub Actions por `workflow_dispatch`, desde la app misma. Existe
 * para el boton "Analizar ahora" de /salud: el analisis con Stockfish no puede correr en
 * Vercel (necesita un binario nativo y minutos, no segundos), pero Gabriel no debería tener
 * que entrar al sitio de GitHub para dispararlo a mano.
 *
 * Necesita `GITHUB_TOKEN` (opcional en lib/env.ts): un token con permiso "Actions: Read and
 * write" sobre este repo, nada mas. Sin ese secreto, esto lanza con un mensaje claro.
 */
export async function dispatchWorkflow(workflowFile: string, inputs?: Record<string, string>): Promise<void> {
  if (!env.GITHUB_TOKEN) {
    throw new Error('Falta GITHUB_TOKEN: no se puede disparar el workflow desde la app.');
  }

  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: inputs ?? {} }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub respondio ${response.status} al disparar ${workflowFile}: ${detail}`);
  }
}
