/**
 * El puente entre Stockfish 19 y el resto de la app.
 *
 * `@lichess-org/stockfish-web` no habla el protocolo de worker que habla el build de nmrugg (el
 * del 18, que se maneja entero con `postMessage`). Es un modulo de ES que se instancia, expone
 * `uci(comando)` y `listen`, y ademas exige que la red neuronal se le pase aparte como buffer:
 * el `.wasm` NO la trae adentro. Este archivo traduce eso al mismo `postMessage` de texto que ya
 * espera `lib/engine/worker-transport.ts`, para que `session.ts` y todo lo que hay encima no
 * cambien una linea.
 *
 * Errores: se mandan como una linea de texto con prefijo `info string error`, que el parser de
 * `protocol.ts` ignora. Lo que importa es que NUNCA se responda `uciok`, porque lo que corta el
 * arranque es el tope de tiempo del hook, y la pagina degrada sola.
 */

let motor = null;
const pendientes = [];

async function arrancar() {
  const { default: crear } = await import('./sf_19_smallnet.js');
  const instancia = await crear();

  // `getRecommendedNnue()` devuelve un nombre de archivo pelado (ej: `nn-61e7af4bb97d.nnue`). La
  // red viaja commiteada al lado de este archivo, asi que se pide por ruta relativa.
  const nombreRed = instancia.getRecommendedNnue();
  if (!nombreRed) throw new Error('El motor no dijo que red neuronal necesita');
  const respuesta = await fetch(new URL(nombreRed, self.location.href));
  if (!respuesta.ok) {
    // Es el caso de "todavia no se corrio el workflow `motor`": la red no esta en el repo.
    throw new Error(`Falta la red neuronal ${nombreRed} (HTTP ${respuesta.status})`);
  }
  instancia.setNnueBuffer(new Uint8Array(await respuesta.arrayBuffer()));

  instancia.listen = (linea) => self.postMessage(linea);
  instancia.onError = (mensaje) => self.postMessage(`info string error ${mensaje}`);

  motor = instancia;
  for (const comando of pendientes.splice(0)) motor.uci(comando);
}

self.onmessage = (evento) => {
  const comando = evento.data;
  if (typeof comando !== 'string') return;
  // Las ordenes que llegan antes de que el modulo termine de cargar se encolan, no se pierden:
  // `session.start()` manda `uci` de inmediato.
  if (motor) motor.uci(comando);
  else pendientes.push(comando);
};

arrancar().catch((error) => {
  // Las dos cosas: la consola es donde se mira cuando el motor no arranca, y la linea de texto es
  // lo que ve el resto del pipeline.
  console.error('[sf19] no se pudo arrancar:', error);
  self.postMessage(`info string error ${error instanceof Error ? error.message : String(error)}`);
});
