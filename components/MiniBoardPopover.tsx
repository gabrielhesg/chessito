'use client';

import { useState, type ReactNode } from 'react';
import { MiniBoard } from '@/components/MiniBoard';

/** Una jugada de una linea, con la posicion que deja. Es lo que dibuja la miniatura. */
export type PasoMirable = {
  san: string;
  /** El FEN DESPUES de la jugada. */
  fen: string;
  desde: string;
  hasta: string;
};

/**
 * Coordina "posarse sobre una jugada y ver la posicion". Vive aparte porque lo necesitan dos
 * pantallas — las lineas del motor en `/partida/[id]` y las dos lineas del entrenador — y la
 * logica tiene una trampa que ya costo una pasada de depuracion:
 *
 * **En el celular un tap dispara `mouseenter`, `focus`, `click` y `mouseleave` en ESE orden.** Con
 * un simple toggle, el `mouseleave` del final cierra la miniatura en el mismo gesto que la abre y
 * no se ve nada. Por eso hay un `fijado`: el hover se va solo al salir, el click/tap se queda
 * hasta tocar otra jugada o la misma.
 */
export function useMiniBoardPopover() {
  const [mirando, setMirando] = useState<{ paso: PasoMirable; fijado: boolean } | null>(null);

  /** Los handlers que van en el elemento de cada jugada. */
  const propsDePaso = (paso: PasoMirable) => ({
    onMouseEnter: () => setMirando((v) => (v?.fijado ? v : { paso, fijado: false })),
    onMouseLeave: () => setMirando((v) => (v && !v.fijado && v.paso === paso ? null : v)),
    onFocus: () => setMirando((v) => (v?.fijado ? v : { paso, fijado: false })),
    onBlur: () => setMirando((v) => (v && !v.fijado && v.paso === paso ? null : v)),
    onPointerDown: () =>
      setMirando((v) => (v?.fijado && v.paso === paso ? null : { paso, fijado: true })),
  });

  return { mirando: mirando?.paso ?? null, propsDePaso, cerrar: () => setMirando(null) };
}

/**
 * La tarjeta flotante con el tablero chico. Se posiciona sola respecto del contenedor con
 * `position: relative` mas cercano, asi que quien la use tiene que tener uno.
 */
export function MiniBoardPopover({
  paso,
  orientacion,
  posicion = 'arriba-derecha',
  extra,
}: {
  paso: PasoMirable | null;
  orientacion: 'white' | 'black';
  /**
   * De que lado se abre. `abajo-*` existe porque las lineas del entrenador viven en la parte alta
   * de la pantalla: abriendo hacia arriba la miniatura se sale por el borde superior y queda
   * cortada.
   */
  posicion?: 'arriba-derecha' | 'arriba-izquierda' | 'abajo-izquierda';
  /** Una linea extra bajo el tablero, por ejemplo la evaluacion de esa jugada. */
  extra?: ReactNode;
}) {
  if (!paso) return null;
  return (
    <div
      className={`pointer-events-none absolute z-20 rounded-lg border border-borde bg-panel p-1.5 shadow-lg ${
        posicion === 'abajo-izquierda' ? 'top-full mt-2 left-0' : 'bottom-full mb-2'
      } ${posicion === 'arriba-derecha' ? 'right-0' : 'left-0'}`}
    >
      <MiniBoard fen={paso.fen} orientacion={orientacion} resaltadas={[paso.desde, paso.hasta]} />
      <p className="mt-1 text-center font-mono text-[11px] text-tenue">{paso.san}</p>
      {extra}
    </div>
  );
}
