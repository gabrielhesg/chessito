import Link from 'next/link';
import { analizarEstaPartida, traerPartidasNuevas } from '@/lib/acciones/partidas';
import { partidasParaEntrenar, type PartidaParaEntrenar } from '@/lib/data';
import { formatTimeControl } from '@/lib/chess/timecontrol';
import { Badge, Button, EmptyState, Pagina, Panel } from '@/components/ui';

export const dynamic = 'force-dynamic';

const NOMBRE_CLASE: Record<string, string> = {
  rapid: 'rápida',
  blitz: 'blitz',
  bullet: 'bala',
  daily: 'correspondencia',
};

const NOMBRE_MOTIVO: Record<string, string> = {
  variante: 'es una variante, no ajedrez estándar',
  correspondencia: 'es por correspondencia',
  daily: 'es por correspondencia',
  sin_jugadas: 'no tiene jugadas',
};

/**
 * `games.termination` guarda el resultado de Gabriel (regla del proyecto), así que `resigned` es
 * que ÉL abandonó y `checkmated` que a él le dieron mate. `win` no se traduce: repetiría la
 * etiqueta "ganaste" que ya está al lado.
 */
const COMO_TERMINO: Record<string, string | null> = {
  win: null,
  checkmated: 'te dieron mate',
  resigned: 'abandonaste',
  timeout: 'por tiempo',
  abandoned: 'por abandono',
  agreed: 'tablas acordadas',
  repetition: 'por repetición',
  stalemate: 'ahogado',
  insufficient: 'material insuficiente',
  timevsinsufficient: 'tiempo contra material insuficiente',
  '50move': 'regla de las 50 jugadas',
};

function cuando(endTime: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(endTime));
}

/**
 * Qué se puede hacer con una partida, según en qué punto del camino al motor está. Todo el
 * texto sale del estado real: una partida sin analizar no ofrece "Entrenar", y una analizada sin
 * errores graves dice por qué no tiene ejercicios en vez de aparecer vacía.
 */
function Acciones({ p, pedida }: { p: PartidaParaEntrenar; pedida: boolean }) {
  const revisar = (
    <Link
      href={`/partida/${p.id}`}
      className="rounded-lg border border-borde-fuerte px-3 py-1.5 text-[12.5px] text-tenue hover:text-texto"
    >
      Revisar
    </Link>
  );

  if (p.ejercicios > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/entrenador?partida=${p.id}`}
          className="rounded-lg bg-acento px-3 py-1.5 text-[12.5px] font-semibold text-fondo"
        >
          Entrenar {p.ejercicios} {p.ejercicios === 1 ? 'error' : 'errores'}
        </Link>
        {revisar}
      </div>
    );
  }

  if (p.analysis_state === 'done') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-tenue">Sin errores graves: no hay ejercicios que sacar.</span>
        {revisar}
      </div>
    );
  }

  if (p.analysis_state === 'skipped') {
    return (
      <span className="text-[12.5px] text-apagado">
        No se analiza: {NOMBRE_MOTIVO[p.skip_reason ?? ''] ?? 'está excluida del motor'}.
      </span>
    );
  }

  if (p.analysis_state === 'failed') {
    return <span className="text-[12.5px] text-critico">El motor no pudo analizarla.</span>;
  }

  // pending o claimed: todavía no hay ejercicios porque el motor no la ha visto.
  if (pedida) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-acento">Pedida al motor · vuelve en unos 10 minutos.</span>
        {revisar}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={analizarEstaPartida.bind(null, p.id)}>
        {/* Fantasma y no primario: como casi todas las partidas recientes son de bala sin
            analizar, en primario la pantalla era una pared de botones coral y "Entrenar",
            que es LA accion, quedaba ahogada entre iguales. Salio de la captura a 390 px. */}
        <Button type="submit" pendingLabel="Pidiendo…">
          Analizar esta partida
        </Button>
      </form>
      {revisar}
    </div>
  );
}

/**
 * Elegir QUÉ partida entrenar, en vez de recibir la que toque.
 *
 * El entrenador sirve una cola ordenada (derrotas recientes de rápida, tema de la semana, y
 * repetición espaciada), y eso está bien para la sesión diaria. Pero "acabo de jugar esta y la
 * quiero revisar ahora" es otra pregunta, y hasta ahora solo se podía llegar a ella buscando la
 * partida en /registro y abriéndola.
 *
 * Una partida recién jugada normalmente todavía no tiene ejercicios: primero hay que traerla, y
 * después el motor tiene que analizarla. Por eso esta pantalla ofrece cada paso donde hace falta,
 * y "Analizar esta partida" le pide al motor ESA partida primero — sin eso, una de bala quedaría
 * detrás de miles de blitz pendientes.
 */
export default async function ElegirPartidaPage({
  searchParams,
}: {
  searchParams: Promise<{ pedida?: string; error?: string }>;
}) {
  const { pedida, error } = await searchParams;
  const idPedida = pedida ? Number.parseInt(pedida, 10) : NaN;
  const partidas = await partidasParaEntrenar(15);

  return (
    <Pagina
      preTitulo={
        <Link href="/entrenador" className="text-[12.5px] text-tenue hover:text-texto">
          ← Entrenador
        </Link>
      }
      titulo="Elegir una partida"
      subtitulo={
        <>
          Tus últimas partidas, de cualquier ritmo. Entrena los errores de la que quieras, o
          revísala primero sin motor.
        </>
      }
    >
      <div className="space-y-5">
        {error ? (
          <p className="rounded-xl border border-critico/40 bg-critico/10 px-3.5 py-2.5 text-sm text-critico">
            No se pudo pedir el análisis: {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-panel px-4 py-3">
          <p className="min-w-0 flex-1 text-[13px] text-tenue">
            ¿No aparece la que acabas de jugar? Tráela de chess.com y queda en cola para el motor.
          </p>
          <form action={traerPartidasNuevas}>
            <Button type="submit" pendingLabel="Trayendo…">
              Traer partidas nuevas
            </Button>
          </form>
        </div>

        <Panel>
          {partidas.length === 0 ? (
            <EmptyState titulo="Todavía no hay partidas" />
          ) : (
            <ul className="flex list-none flex-col divide-y divide-borde p-0">
              {partidas.map((p) => (
                <li key={p.id} className="flex flex-col gap-2.5 py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] tabular-nums text-tenue">{cuando(p.end_time)}</span>
                    <Badge>
                      {NOMBRE_CLASE[p.time_class] ?? p.time_class} {formatTimeControl(p.time_control)}
                    </Badge>
                    <Badge tono={p.result === 'win' ? 'bien' : p.result === 'loss' ? 'critico' : 'neutro'}>
                      {p.result === 'win' ? 'ganaste' : p.result === 'loss' ? 'perdiste' : 'tablas'}
                    </Badge>
                  </div>
                  <p className="text-sm">
                    contra <span className="font-medium">{p.opp_username}</span>
                    <span className="text-apagado">
                      {' '}
                      · con {p.my_color === 'white' ? 'blancas' : 'negras'}
                      {(() => {
                        const como = p.termination in COMO_TERMINO ? COMO_TERMINO[p.termination] : p.termination;
                        return como ? ` · ${como}` : '';
                      })()}
                    </span>
                  </p>
                  <Acciones p={p} pedida={p.id === idPedida} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Pagina>
  );
}
