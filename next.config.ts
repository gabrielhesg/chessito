import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * Los headers que aislan el documento (`cross-origin isolated`). Sin ellos `SharedArrayBuffer` no
 * existe y Stockfish 19 no puede crear su memoria, que es compartida (`shared: true`, verificado
 * sobre el propio archivo).
 *
 * Van SOLO en las dos paginas que usan el motor: el aislamiento es por documento, asi que
 * acotarlo da el mismo resultado con mucho menos riesgo — `require-corp` bloquea cualquier
 * recurso de otro dominio que no mande CORP, y no hay por que arriesgar `/entrar` ni la portada.
 */
const HEADERS_AISLAMIENTO = [
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
];

/**
 * El propio worker tambien tiene que pasar el filtro del documento aislado: un `require-corp`
 * bloquea el script del worker si la respuesta no declara que se puede incrustar. Sin esto el
 * worker ni siquiera se crea y el error que llega es `ERR_BLOCKED_BY_RESPONSE`, que no dice nada
 * sobre la causa.
 */
const HEADERS_MOTOR = [
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
];

/**
 * Los headers solo se mandan cuando la red neuronal del 19 esta commiteada.
 *
 * No es cautela de mas: MEDIDO en el navegador, el Stockfish 18 de nmrugg NO arranca en un
 * documento aislado (se cuelga sin llegar a `uciok`). Asi que aislar antes de tener la red deja
 * la pantalla sin ningun motor que pueda correr ahi — el 19 sin su red tampoco arranca. Con esta
 * comprobacion el cambio de motor es automatico y no hay un momento intermedio roto: hasta que el
 * workflow `motor` commitee la red, la pagina no se aisla y corre el 18; desde que la commitea,
 * se aisla y corre el 19.
 */
function hayRedNeuronal(): boolean {
  try {
    return readdirSync(join(process.cwd(), 'public', 'stockfish')).some((archivo) =>
      archivo.endsWith('.nnue'),
    );
  } catch {
    return false;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    // Un build que ignora errores de tipos no es un build. tsc corre igual en CI.
    ignoreBuildErrors: false,
  },
  async headers() {
    if (!hayRedNeuronal()) return [];
    return [
      { source: '/stockfish/:path*', headers: HEADERS_MOTOR },
      { source: '/partida/:path*', headers: HEADERS_AISLAMIENTO },
      { source: '/entrenador/:path*', headers: HEADERS_AISLAMIENTO },
    ];
  },
};

export default nextConfig;
