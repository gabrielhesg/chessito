'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

type Variante = 'primario' | 'fantasma' | 'peligro';

const ESTILO: Record<Variante, string> = {
  primario: 'bg-acento text-white hover:brightness-110 border-transparent',
  fantasma: 'border-borde-fuerte text-texto hover:bg-panel-alto',
  peligro: 'border-critico/50 text-critico hover:bg-critico/10',
};

/**
 * Unico boton de la app. Es componente de cliente por `useFormStatus`: dentro de un `<form>`
 * con server action se deshabilita solo y muestra que esta trabajando mientras la accion corre.
 * Sin eso, "Actualizar ahora" (que dispara una ingesta de segundos) no daba ninguna senal y
 * invitaba a hacer doble click.
 */
export function Button({
  children,
  variante = 'fantasma',
  type = 'button',
  pendingLabel,
  onClick,
  disabled,
  className = '',
}: {
  children: ReactNode;
  variante?: Variante;
  type?: 'button' | 'submit';
  pendingLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const trabajando = type === 'submit' && pending;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || trabajando}
      aria-busy={trabajando || undefined}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${ESTILO[variante]} ${className}`}
    >
      {trabajando && pendingLabel ? pendingLabel : children}
    </button>
  );
}
