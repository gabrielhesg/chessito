'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guardarRevision } from '@/lib/reviews/actions';
import type { ReviewMotivo } from '@/lib/data';

/**
 * Los dos gestos del ritual: marcar DONDE crees que se perdio la partida y decir POR QUE.
 *
 * `motivo` es una lista cerrada de chips y no un campo de texto: en el celular un chip es un tap
 * y un teclado es la friccion que mata el habito. Y una lista cerrada es lo unico que despues se
 * puede agrupar (`v_motivos_de_derrota`).
 *
 * El ply marcado es la posicion en la que estas parado, no un selector aparte: ya navegaste
 * hasta ahi con las flechas o tocando la jugada, y pedir el numero otra vez seria pedir dos
 * veces lo mismo.
 */
const MOTIVOS: { valor: ReviewMotivo; texto: string }[] = [
  { valor: 'colgue_material', texto: 'Colgué material' },
  { valor: 'no_supe_que_hacer', texto: 'No supe qué hacer' },
  { valor: 'me_quede_sin_tiempo', texto: 'Me quedé sin tiempo' },
  { valor: 'me_superaron_en_la_apertura', texto: 'Me superaron en la apertura' },
  { valor: 'otro', texto: 'Otra cosa' },
];

export function MarcarRevision({
  gameId,
  plyActual,
  sanActual,
  plyDelMotor,
}: {
  gameId: number;
  plyActual: number;
  sanActual: string | null;
  /**
   * El ply que el motor senala. Viaja hasta aca para quedar CONGELADO en la fila: el analisis se
   * puede re-correr con otra version de Stockfish, y la comparacion tiene que ser contra lo que
   * viste, no contra lo que el motor diga manana.
   */
  plyDelMotor: number | null;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<ReviewMotivo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const jugadaNumero = plyActual > 0 ? Math.ceil(plyActual / 2) : null;
  const puedeConfirmar = plyActual > 0 && motivo !== null;

  function guardar(saltar: boolean): void {
    setError(null);
    iniciar(async () => {
      try {
        await guardarRevision({
          gameId,
          plyMarcado: saltar ? null : plyActual,
          motivo: saltar ? null : motivo,
          plyDelMotor,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo guardar');
      }
    });
  }

  return (
    <div className="rounded-xl border border-acento/40 bg-acento/[0.06] px-4 py-4">
      <p className="eyebrow text-acento">Primero tú</p>
      <p className="mt-1.5 text-sm leading-relaxed">
        Recorre la partida y para en la jugada donde crees que se perdió. Después dices por qué, y
        recién ahí aparece lo que dice el motor.
      </p>

      <div className="mt-3.5 rounded-lg border border-borde bg-panel px-3.5 py-2.5">
        <p className="text-2xs text-apagado">Jugada marcada</p>
        <p className="mt-0.5 text-sm font-medium">
          {jugadaNumero === null ? (
            <span className="text-tenue">Ninguna todavía — avanza hasta una jugada</span>
          ) : (
            <>
              jugada {jugadaNumero}
              {sanActual ? <span className="ml-1.5 font-mono text-acento">{sanActual}</span> : null}
            </>
          )}
        </p>
      </div>

      <p className="mt-3.5 text-2xs text-apagado">¿Qué pasó?</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            aria-pressed={motivo === m.valor}
            onClick={() => setMotivo(m.valor)}
            className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors ${
              motivo === m.valor
                ? 'border-acento bg-acento/15 font-medium text-acento'
                : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
            }`}
          >
            {m.texto}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!puedeConfirmar || enviando}
          onClick={() => guardar(false)}
          className="rounded-lg bg-acento px-3.5 py-2 text-[12.5px] font-semibold text-fondo disabled:opacity-40"
        >
          {enviando ? 'Guardando…' : 'Confirmar y ver el motor'}
        </button>
        {/* El escape es visible a proposito: el ritual no se obliga. Saltarlo tambien marca la
            partida como revisada, porque la alternativa es una cola que crece para siempre. */}
        <button
          type="button"
          disabled={enviando}
          onClick={() => guardar(true)}
          className="text-[12.5px] text-tenue underline underline-offset-2 hover:text-texto disabled:opacity-40"
        >
          Ver lo que dice el motor
        </button>
      </div>

      {error ? <p className="mt-2.5 text-[12.5px] text-critico">{error}</p> : null}
    </div>
  );
}
