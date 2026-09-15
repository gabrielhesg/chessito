import type { ReactNode } from 'react';

/**
 * Tooltip de termino: un icono "?" con `<details>/<summary>`, sin JS ni `useState`.
 * A diferencia de `title=`, se abre con tap en celular (no solo con hover de mouse), que es
 * como se usa esta app la mayor parte del tiempo.
 */
export function Ayuda({ children, alinear = 'izq' }: { children: ReactNode; alinear?: 'izq' | 'der' }) {
  return (
    <details className="relative inline-block align-middle [&[open]>summary]:border-acento [&[open]>summary]:text-acento">
      <summary className="ml-1 inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full border border-apagado text-[10px] leading-none text-apagado transition-colors hover:border-texto hover:text-texto [&::-webkit-details-marker]:hidden">
        ?<span className="sr-only">Que significa</span>
      </summary>
      <div
        className={`absolute top-6 z-20 w-64 rounded-lg border border-borde-fuerte bg-panel-alto p-3 text-xs font-normal normal-case leading-relaxed tracking-normal text-texto shadow-flotante ${
          alinear === 'der' ? 'right-0' : 'left-0'
        }`}
      >
        {children}
      </div>
    </details>
  );
}
