# Stockfish para el navegador

Estos archivos son el motor que corre en el navegador para el análisis interactivo de
`/partida/[id]` y del entrenador. **No los edites**: se bajan tal cual de su origen.

Hay **dos** motores, y cuál se carga lo decide `lib/engine/useBrowserEngine.ts` mirando
`crossOriginIsolated`. No es una cadena de respaldo: cada uno corre en un caso y **no corre en el
otro**, medido en el navegador.

| | Stockfish 19 | Stockfish 18 |
|---|---|---|
| Paquete | `@lichess-org/stockfish-web` **0.5.0** | `stockfish` (nmrugg) **18.0.8** |
| Build | `sf_19_smallnet` | `lite-single`, un hilo |
| Archivos | `sf_19_smallnet.js` (29 KB), `sf_19_smallnet.wasm` (505 KB) y la red `nn-61e7af4bb97d.nnue` | `stockfish-18-lite-single.js` (21 KB) y `.wasm` (7,3 MB) |
| Puente | `sf19-worker.js` | ninguno: ya habla `postMessage` |
| Necesita documento aislado | **sí** | **no**, y además *no arranca* si lo está |
| Licencia | AGPL-3.0-or-later, `AGPL-3.0.txt` | GPL-3.0, `Copying.txt` |

## La red neuronal no viene dentro del `.wasm`

Es la diferencia grande con el 18. El `.wasm` del 19 pide su red aparte (`setNnueBuffer`), y hay
que bajarla de `tests.stockfishchess.org`, que no es npm. La baja y la commitea el workflow
**`motor`** (`.github/workflows/motor.yml`), que además imprime su tamaño antes de commitear.

El nombre de la red no está escrito a mano en ninguna parte: el workflow lo lee del propio
`.wasm`, y el puente se lo pregunta al motor con `getRecommendedNnue()`.

**Mientras la red no esté commiteada, la app no se queda sin motor**: `next.config.ts` solo manda
los headers de aislamiento cuando existe un `.nnue` en esta carpeta, así que hasta entonces las
páginas no se aíslan y corre el 18.

## Por qué el 18 sigue acá

Porque el 19 no puede correr sin aislamiento, y el aislamiento no puede estar siempre (ver
arriba). Borrarlo sería quedarse sin motor en el único caso que hoy existe en producción.

## Por qué están commiteados y no instalados

El paquete de nmrugg pesa **168 MB** porque trae todos los builds. Un `postinstall` que baje eso
en cada `pnpm install` y en cada build de Vercel no se paga. Van versionados, con la versión
fijada acá, mismo criterio que las "versiones exactas fijadas" del resto del proyecto.

## Tres cosas que hay que saber si los tocas

1. **Cada `.js` busca su `.wasm` como hermano**, en la misma carpeta y con el mismo nombre base.
   Si mueves uno, mueve el otro. La red neuronal también se busca acá al lado.
2. **`middleware.ts` excluye `/stockfish` de su matcher.** Sin esa excepción el worker recibe el
   HTML de la pantalla de login en vez del motor, y falla con un error que no dice nada.
3. **`next.config.ts` manda `Cross-Origin-Resource-Policy` en `/stockfish/:path*`.** Un documento
   con `require-corp` bloquea el script del worker si la respuesta no lo declara, y el error que
   llega es `ERR_BLOCKED_BY_RESPONSE`, que tampoco dice nada sobre la causa.

## Cómo volver a bajarlos

```sh
npm pack @lichess-org/stockfish-web@0.5.0
tar -xzf lichess-org-stockfish-web-0.5.0.tgz \
  package/sf_19_smallnet.js package/sf_19_smallnet.wasm package/LICENSE

npm pack stockfish@18.0.8
tar -xzf stockfish-18.0.8.tgz \
  package/bin/stockfish-18-lite-single.js \
  package/bin/stockfish-18-lite-single.wasm \
  package/Copying.txt
```

## Licencia

Los dos son software libre y acá se sirven al navegador sin modificar, con su texto de licencia
al lado, que es lo que ambas piden. El 19 es **AGPL-3.0-or-later** (`AGPL-3.0.txt`), más estricta
que la GPL-3 del 18: si alguna vez esto se ofrece como servicio a terceros, hay que revisarlo con
calma. El código fuente está en <https://github.com/official-stockfish/Stockfish>, y los ports a
WebAssembly en <https://github.com/lichess-org/stockfish-web> y
<https://github.com/nmrugg/stockfish.js>.
