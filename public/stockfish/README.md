# Stockfish para el navegador

Los dos archivos de al lado son el motor que corre en el navegador para el análisis interactivo
de `/partida/[id]`. **No los edites**: se bajan tal cual de su origen.

| Dato | Valor |
|---|---|
| Paquete | `stockfish` (nmrugg/stockfish.js), versión **18.0.8** |
| Build | `lite-single` — WebAssembly de **un solo hilo** |
| Archivos | `stockfish-18-lite-single.js` (21 KB) y `stockfish-18-lite-single.wasm` (7,3 MB) |
| Licencia | GPL-3.0, texto completo en `Copying.txt` |

## Por qué están commiteados y no instalados

El paquete de npm pesa **168 MB** porque trae todos los builds, incluidos los multi-hilo de más
de 100 MB cada uno. Se usan 7,3 MB. Un `postinstall` que baje 168 MB en cada `pnpm install` y en
cada build de Vercel no se paga. Van versionados, con la versión fijada acá, mismo criterio que
las "versiones exactas fijadas" del resto del proyecto.

## Por qué el build de un solo hilo

El build multi-hilo necesita `SharedArrayBuffer`, y eso exige servir **todo el sitio** con los
headers `Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy`. Peor: sin esos headers no
falla, **cae a un hilo en silencio**, que es el tipo de problema que se descubre tarde y mal.

Verificado sobre este archivo concreto: `grep -c SharedArrayBuffer stockfish-18-lite-single.js`
da **0**. Para analizar una posición a la vez, un hilo sobra.

## Dos cosas que hay que saber si los tocas

1. **El `.js` busca el `.wasm` como hermano**, en la misma carpeta y con el mismo nombre base. Si
   mueves uno, mueve el otro.
2. **`middleware.ts` excluye `/stockfish` de su matcher.** Sin esa excepción el worker recibe el
   HTML de la pantalla de login en vez del motor, y falla con un error que no dice nada.

## Cómo volver a bajarlos

```sh
npm pack stockfish@18.0.8
tar -xzf stockfish-18.0.8.tgz \
  package/bin/stockfish-18-lite-single.js \
  package/bin/stockfish-18-lite-single.wasm \
  package/Copying.txt
```

## Licencia

Stockfish es software libre bajo GPL-3.0 y acá se sirve el binario al navegador sin modificar.
`Copying.txt` viaja al lado, que es lo que la licencia pide. El código fuente está en
<https://github.com/official-stockfish/Stockfish> y el port a WebAssembly en
<https://github.com/nmrugg/stockfish.js>.
