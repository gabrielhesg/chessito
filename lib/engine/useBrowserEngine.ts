'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { UciSession, type EvalLine } from '@/lib/engine/session';
import { createWorkerTransport } from '@/lib/engine/worker-transport';

/** Ruta del motor dentro de `public/`. `middleware.ts` excluye `/stockfish` de su matcher. */
const RUTA_MOTOR = '/stockfish/stockfish-18-lite-single.js';

/** Si el .wasm no baja, el `fetch` se queda colgado sin rechazar. Sin este tope no hay error. */
const TIMEOUT_CARGA_MS = 20_000;

/** Un hilo: es el build lite-single. Hash chico porque las busquedas son cortas. */
const THREADS = 1;
const HASH_MB = 16;

export type EngineStatus =
  | 'apagado'
  | 'no-soportado'
  | 'cargando'
  | 'listo'
  | 'pensando'
  | 'error';

export type BrowserEngine = {
  status: EngineStatus;
  /** Las mejores lineas de la posicion actual, la mejor primero. Vacio mientras no haya nada. */
  lines: readonly EvalLine[];
  /** Profundidad alcanzada por la busqueda en curso. */
  depth: number;
  engineName: string;
};

/**
 * Stockfish en el navegador, para el analisis interactivo de una posicion.
 *
 * No contradice la regla de CLAUDE.md de que el motor no corre en el navegador: esa regla razona
 * sobre el analisis POR LOTES de 10.000 partidas, que sigue viviendo en GitHub Actions. Esto es
 * otra carga: una posicion a la vez, con la pestana abierta por definicion.
 *
 * Tres cosas que este hook resuelve y que son faciles de hacer mal:
 *
 *  1. **Carga perezosa.** El worker se crea dentro de un efecto, solo cuando `enabled` pasa a
 *     true. Los 7,3 MB del .wasm no se bajan hasta que el usuario enciende el motor.
 *
 *  2. **Cancelacion.** Al cambiar de posicion no basta con mandar `stop`: hay que ESPERAR el
 *     `bestmove` de la busqueda abortada antes de mandar la siguiente. Si no, los `info` viejos
 *     se mezclan con los nuevos y la pantalla muestra lineas de otra posicion. Se resuelve con
 *     un bucle serializado (nunca dos busquedas a la vez) que coalesce las posiciones
 *     intermedias: si navegas rapido por diez jugadas, se analiza la decima, no las diez.
 *
 *  3. **Degradacion.** Ni un solo camino lanza hacia React. Sin Worker, sin WebAssembly, con el
 *     .wasm caido o con la carga colgada, el estado queda en `no-soportado`/`error` y la pagina
 *     sigue en pie con las evaluaciones que ya estan en la base.
 */
export function useBrowserEngine({
  uciMoves,
  enabled,
  multiPv = 3,
  depth = 18,
}: {
  /** Jugadas desde la posicion inicial hasta la posicion a analizar. */
  uciMoves: readonly string[];
  enabled: boolean;
  multiPv?: number;
  depth?: number;
}): BrowserEngine {
  // El estado del worker. `apagado` y `no-soportado` NO viven aca: se derivan abajo, porque
  // ponerlos con un setState dentro del efecto es un estado duplicado (y el linter de hooks lo
  // marca, con razon).
  const [motor, setMotor] = useState<'inactivo' | 'cargando' | 'listo' | 'pensando' | 'error'>(
    'inactivo',
  );
  const [soportado] = useState(
    () => typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined',
  );
  const [lines, setLines] = useState<readonly EvalLine[]>([]);
  const [profundidad, setProfundidad] = useState(0);
  const [engineName, setEngineName] = useState('');

  const sesionRef = useRef<UciSession | null>(null);
  /** La busqueda en curso, para poder pedirle que corte. */
  const enCursoRef = useRef<{ stop: () => void } | null>(null);
  /** La ultima posicion pedida. Las intermedias se pisan: no hay cola. */
  const pendienteRef = useRef<readonly string[] | null>(null);
  /** Evita que dos bucles corran a la vez. */
  const bucleActivoRef = useRef(false);
  /** Descarta respuestas de una busqueda vieja (cinturon, ademas de los tirantes del bucle). */
  const tokenRef = useRef(0);
  const vivoRef = useRef(true);

  const correrBucle = useCallback(async () => {
    if (bucleActivoRef.current) return;
    bucleActivoRef.current = true;
    try {
      while (pendienteRef.current && vivoRef.current) {
        const posicion = pendienteRef.current;
        pendienteRef.current = null;
        const sesion = sesionRef.current;
        if (!sesion) break;

        const token = (tokenRef.current += 1);
        setLines([]);
        setProfundidad(0);
        setMotor('pensando');

        const handle = sesion.searchStreaming(posicion, {
          depth,
          multiPv,
          onUpdate: (nuevas, alcanzada) => {
            if (token !== tokenRef.current || !vivoRef.current) return;
            setLines(nuevas);
            setProfundidad(alcanzada);
          },
        });
        enCursoRef.current = handle;
        // Si mientras tanto llega otra posicion, `pedir` le manda `stop` a esta.
        await handle.terminada;
        enCursoRef.current = null;
      }
      if (vivoRef.current && sesionRef.current) setMotor('listo');
    } finally {
      bucleActivoRef.current = false;
    }
  }, [depth, multiPv]);

  const pedir = useCallback(
    (posicion: readonly string[]) => {
      pendienteRef.current = posicion;
      // Cortar la busqueda en curso; el bucle recoge la pendiente cuando el motor confirme.
      enCursoRef.current?.stop();
      void correrBucle();
    },
    [correrBucle],
  );

  // Arranque y apagado del worker.
  useEffect(() => {
    if (!enabled || !soportado) return;

    vivoRef.current = true;
    let sesionLocal: UciSession | null = null;
    let cancelado = false;

    const arrancar = async (): Promise<void> => {
      setMotor('cargando');
      const worker = new Worker(RUTA_MOTOR);
      const sesion = new UciSession(createWorkerTransport(worker));
      sesionLocal = sesion;

      // El `.wasm` puede quedarse colgado sin rechazar nunca (red caida): sin tope, `cargando`
      // seria para siempre.
      const tope = new Promise<never>((_, rechazar) =>
        setTimeout(() => rechazar(new Error('El motor tardo demasiado en cargar')), TIMEOUT_CARGA_MS),
      );
      await Promise.race([sesion.start(), tope]);
      await Promise.race([sesion.configure({ threads: THREADS, hashMb: HASH_MB }), tope]);

      if (cancelado) {
        sesion.quit();
        return;
      }
      sesionRef.current = sesion;
      setEngineName(sesion.engineName);
      setMotor('listo');
    };

    arrancar().catch((error: unknown) => {
      // Ni un camino lanza hacia React: el panel se dibuja deshabilitado y la pagina sigue.
      console.error('[motor] no se pudo iniciar:', error);
      if (!cancelado) setMotor('error');
    });

    return () => {
      cancelado = true;
      vivoRef.current = false;
      enCursoRef.current?.stop();
      enCursoRef.current = null;
      pendienteRef.current = null;
      try {
        sesionLocal?.quit();
      } catch {
        // El worker ya estaba muerto. No hay nada que hacer ni nada que reportar.
      }
      sesionRef.current = null;
    };
  }, [enabled, soportado]);

  // Cambio de posicion. El debounce ahorra trabajo; lo que garantiza correccion es el bucle.
  const clave = uciMoves.join(' ');
  const listoParaBuscar = motor === 'listo' || motor === 'pensando';
  useEffect(() => {
    if (!listoParaBuscar) return;
    const id = setTimeout(() => pedir(clave === '' ? [] : clave.split(' ')), 200);
    return () => clearTimeout(id);
  }, [clave, listoParaBuscar, pedir]);

  const status: EngineStatus = !enabled
    ? 'apagado'
    : !soportado
      ? 'no-soportado'
      : motor === 'inactivo'
        ? 'cargando'
        : motor;

  return { status, lines, depth: profundidad, engineName };
}
