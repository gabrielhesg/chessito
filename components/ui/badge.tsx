import type { ReactNode } from 'react';

type Tono = 'neutro' | 'bien' | 'aviso' | 'serio' | 'critico' | 'acento';

const TONO: Record<Tono, string> = {
  neutro: 'border-borde-fuerte text-tenue',
  bien: 'border-bien/40 text-bien bg-bien/10',
  aviso: 'border-aviso/40 text-aviso bg-aviso/10',
  serio: 'border-serio/40 text-serio bg-serio/10',
  critico: 'border-critico/40 text-critico bg-critico/10',
  acento: 'border-acento/40 text-acento bg-acento/10',
};

export function Badge({
  children,
  tono = 'neutro',
  className = '',
}: {
  children: ReactNode;
  tono?: Tono;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-medium ${TONO[tono]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Clasificacion de una jugada (`moves.classification`: 1 imprecision, 2 error, 3 grave).
 *
 * SIEMPRE lleva glifo y texto, nunca color solo. No es una preferencia estetica: corri el
 * validador de la guia de visualizacion sobre los tres colores contra la superficie real de la
 * app y amarillo/naranja/rojo miden dE 5.5 entre si con deuteranopia — indistinguibles. El
 * glifo (?! / ? / ??) es la convencion de toda la literatura de ajedrez y ademas es el canal
 * que hace la distincion accesible; el color solo refuerza.
 */
const CLASIFICACION = {
  1: { glifo: '?!', nombre: 'Imprecisión', tono: 'aviso' },
  2: { glifo: '?', nombre: 'Error', tono: 'serio' },
  3: { glifo: '??', nombre: 'Grave', tono: 'critico' },
} as const satisfies Record<number, { glifo: string; nombre: string; tono: Tono }>;

export function Clasificacion({
  valor,
  soloGlifo = false,
}: {
  valor: number | null | undefined;
  soloGlifo?: boolean;
}) {
  if (valor !== 1 && valor !== 2 && valor !== 3) return null;
  const { glifo, nombre, tono } = CLASIFICACION[valor];
  return (
    <Badge tono={tono}>
      <span aria-hidden className="font-bold">
        {glifo}
      </span>
      {soloGlifo ? <span className="sr-only">{nombre}</span> : nombre}
    </Badge>
  );
}

/** Semaforo de chequeos: la forma cambia junto con el color, no solo el color. */
export function Semaforo({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? 'text-bien' : 'text-critico'}`}>
      <span aria-hidden>{ok ? '●' : '▲'}</span>
      <span className="sr-only">{ok ? 'correcto:' : 'con problemas:'}</span>
      {children}
    </span>
  );
}
