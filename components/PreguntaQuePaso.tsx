'use client';

import { useMemo, useState } from 'react';
import { TEXTO_CONCEPTO, type Concepto } from '@/lib/puzzles/explain';

/**
 * La pregunta de un tap al fallar, ANTES de revelar la respuesta.
 *
 * Lo que mide no es si sabes la jugada — eso ya lo midio el intento — sino si sabes QUE te paso.
 * Un error que cometes y reconoces se corrige con practica; uno que cometes y no reconoces
 * necesita estudio. Son dos tratamientos distintos y hasta ahora la app no podia separarlos.
 *
 * Va antes de revelar porque despues la respuesta es obvia y la pregunta no mediria nada.
 */

/** Los conceptos que se ofrecen como alternativas. Son los que `diagnostico.ts` sabe detectar. */
const OFRECIDOS: Concepto[] = [
  'cuelga_la_pieza_movida',
  'abandonas_la_defensa',
  'no_atiendes_la_amenaza',
  'permite_una_amenaza',
  'permite_mate',
  'pierde_material',
  'empeora_la_posicion',
];

/**
 * Baraja estable a partir del id del ejercicio: las opciones no pueden saltar de lugar entre
 * renders (seria imposible tocar la que querias), pero tampoco pueden salir siempre en el mismo
 * orden, o la correcta se aprende por posicion en vez de por contenido.
 */
function ordenEstable<T>(items: readonly T[], semilla: number): T[] {
  return items
    .map((item, i) => ({ item, peso: Math.sin(semilla * 97 + i * 31) }))
    .sort((a, b) => a.peso - b.peso)
    .map((x) => x.item);
}

export function PreguntaQuePaso({
  puzzleId,
  conceptoCalculado,
  onResponder,
  onSaltar,
}: {
  puzzleId: number;
  /**
   * Lo que la app derivo de la linea de refutacion. Llega como `string` y no como `Concepto`
   * porque `puzzle_attempts.concepto` guarda tambien los valores anteriores a la Fase 11: si no
   * esta entre los ofrecidos, simplemente no se incluye y la pregunta se arma con cuatro
   * alternativas. Preferible a inventar una opcion que el diagnostico no sabe nombrar.
   */
  conceptoCalculado: string | null;
  onResponder: (elegido: Concepto) => void;
  onSaltar: () => void;
}) {
  const [enviado, setEnviado] = useState(false);

  const opciones = useMemo(() => {
    const calculado = OFRECIDOS.find((c) => c === conceptoCalculado) ?? null;
    const otras = OFRECIDOS.filter((c) => c !== calculado);
    const elegidas = ordenEstable(otras, puzzleId).slice(0, calculado ? 3 : 4);
    const todas = calculado ? [calculado, ...elegidas] : elegidas;
    return ordenEstable(todas, puzzleId + 1);
  }, [conceptoCalculado, puzzleId]);

  return (
    <div className="rounded-xl border border-acento/40 bg-acento/[0.06] px-4 py-4">
      <p className="eyebrow text-acento">Antes de ver la respuesta</p>
      <p className="mt-1.5 text-sm">¿Qué crees que pasó?</p>

      <div className="mt-3 flex flex-col gap-2">
        {opciones.map((c) => (
          <button
            key={c}
            type="button"
            disabled={enviado}
            onClick={() => {
              setEnviado(true);
              onResponder(c);
            }}
            className="rounded-lg border border-borde px-3 py-2 text-left text-[13px] text-texto-suave transition-colors hover:border-acento hover:text-texto disabled:opacity-40"
          >
            {TEXTO_CONCEPTO[c]}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={enviado}
        onClick={() => {
          setEnviado(true);
          onSaltar();
        }}
        className="mt-3 text-[12.5px] text-tenue underline underline-offset-2 hover:text-texto disabled:opacity-40"
      >
        No sé — muéstrame
      </button>
    </div>
  );
}
