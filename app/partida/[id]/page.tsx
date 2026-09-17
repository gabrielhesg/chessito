import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { gameDetail, openingNames, revisionDePartida } from '@/lib/data';
import { despojarDelMotor, esModoCiego } from '@/lib/reviews/ciego';
import { accuracyDePartida } from '@/lib/analysis/accuracy';
import { formatTimeControl } from '@/lib/chess/timecontrol';
import { env } from '@/lib/env';
import { Ayuda, Badge, Clasificacion, Pagina, Panel } from '@/components/ui';
import { GameReview, type JugadaUI } from '@/components/GameReview';

export const dynamic = 'force-dynamic';

const NOMBRE_FASE: Record<number, string> = { 0: 'la apertura', 1: 'el medio juego', 2: 'el final' };

/** Los mismos cinco motivos de `MarcarRevision`, para leerlos de vuelta. */
const NOMBRE_MOTIVO: Record<string, string> = {
  colgue_material: 'Colgué material',
  no_supe_que_hacer: 'No supe qué hacer',
  me_quede_sin_tiempo: 'Me quedé sin tiempo',
  me_superaron_en_la_apertura: 'Me superaron en la apertura',
  otro: 'Otra cosa',
};

/** Mediana, no promedio: un solo "pensar tres minutos" corre el promedio de toda la partida. */
function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) return null;
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  const a = orden[medio] ?? 0;
  return orden.length % 2 === 1 ? a : ((orden[medio - 1] ?? a) + a) / 2;
}

/** Tarjeta chica de la columna derecha: etiqueta en mono, numero grande. */
function Mini({
  etiqueta,
  valor,
  sufijo,
  tono,
  ayuda,
  oculto,
}: {
  etiqueta: string;
  valor: string;
  sufijo?: string;
  tono?: 'critico';
  /** Que significa el numero. Un numero grande en rojo sin nombre no se entiende y no se cree. */
  ayuda?: ReactNode;
  /** En modo ciego la tarjeta no se muestra vacia: se va. Un "—" invita a preguntarse por que. */
  oculto?: boolean;
}) {
  if (oculto) return null;
  return (
    <div className="rounded-xl border border-borde bg-panel px-3.5 py-3">
      {/* `div` y no `p`: `Ayuda` renderiza un `<details>/<summary>`, y `<details>` no puede ser
          descendiente de `<p>`. El navegador reestructuraba el DOM y React reportaba un error de
          hidratacion en la mejor pantalla de la app. */}
      <div className="eyebrow inline-flex items-center">
        {etiqueta}
        {ayuda ? <Ayuda>{ayuda}</Ayuda> : null}
      </div>
      <p className={`mt-1.5 text-[20px] font-semibold tabular-nums ${tono === 'critico' ? 'text-critico' : ''}`}>
        {valor}
        {sufijo ? <span className="ml-1 text-[12px] font-normal text-tenue">{sufijo}</span> : null}
      </p>
    </div>
  );
}

/**
 * Revision de una partida. Es el hueco mas grande que tenia la app frente a chess.com y Lichess:
 * /registro listaba 10.000 partidas y no habia forma de abrir ninguna y ver que paso — el unico
 * link disponible salia hacia chess.com.
 *
 * Todo sale de `moves`, que ya tenia la evaluacion por ply, la clasificacion, el tiempo de cada
 * jugada y la fase desde las Fases 2 y 3. No hizo falta ni una migracion ni tocar el motor.
 */
export default async function PartidaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ply?: string; revelar?: string }>;
}) {
  const { id } = await params;
  const { ply, revelar } = await searchParams;
  const numeroId = Number.parseInt(id, 10);
  if (!Number.isFinite(numeroId)) notFound();

  const detalle = await gameDetail(numeroId);
  if (!detalle) notFound();

  const { game, moves } = detalle;
  const nombres = game.opening_id ? await openingNames([game.opening_id]) : new Map<string, string>();
  const apertura = game.opening_id ? (nombres.get(game.opening_id) ?? 'Sin resolver') : 'Sin resolver';

  // ============================================================
  // Modo "Primero yo"
  // ============================================================
  // El ritual del plan de entrenamiento es analizar la derrota SIN motor antes de verlo. Hasta
  // ahora esta pantalla no solo no lo soportaba: lo saboteaba, porque abria con la precision,
  // los glifos `??` y "tu peor jugada fue Nxf7" antes de que el alumno mirara el tablero.
  //
  // Solo se activa en derrotas de RAPIDA sin revisar. Una victoria no tiene ritual, y revisar
  // bala no esta en el plan. `?revelar=1` es el escape para volver a mirar sin marcar nada.
  const revision = await revisionDePartida(numeroId).catch(() => null);
  const modoCiego = esModoCiego({
    timeClass: game.time_class,
    result: game.result,
    yaRevisada: revision !== null,
    revelar: revelar === '1',
  });

  // El despojo es del SERVIDOR, no un `display: none`: en modo ciego la evaluacion, la
  // clasificacion y la mejor jugada NO viajan al navegador. Mirar el HTML no es una forma de
  // hacer trampa.
  const jugadas: JugadaUI[] = moves.map((m) => {
    const completa: JugadaUI = {
      ply: m.ply,
      san: m.san,
      uci: m.uci,
      bestUci: m.best_uci,
      isMine: m.is_mine,
      isBook: m.is_book,
      evalCp: m.eval_cp,
      mateIn: m.mate_in,
      cpLoss: m.cp_loss,
      classification: m.classification,
      moveTimeMs: m.move_time_ms,
      clockMs: m.clock_ms,
    };
    return modoCiego ? despojarDelMotor(completa) : completa;
  });

  const mias = moves.filter((m) => m.is_mine);
  const precision = accuracyDePartida(
    mias.map((m) => ({ winPctLoss: m.win_pct_loss, isBook: m.is_book, isDecided: m.is_decided })),
  );

  // Momentos clave, la idea de Game Review: donde se sale del libro, que error definio la
  // partida, y donde se fue el reloj. Todo derivado de `moves`, sin motor extra.
  const ultimaDeLibro = [...mias].reverse().find((m) => m.is_book);
  // Quien se salio de la teoria NO es quien jugo la ultima de libro: es quien jugo la PRIMERA
  // fuera de ella. Casi siempre es el rival, y decir "de ahi en adelante jugaste solo" sobre una
  // jugada propia daba a entender lo contrario. La primera fuera de libro puede no existir
  // (partida entera dentro del libro), y ahi no hay nadie a quien nombrar.
  const primeraFueraDeLibro = moves.find((m) => !m.is_book);
  const peorJugada = mias
    .filter((m) => !m.is_book && !m.is_decided && m.cp_loss !== null)
    .sort((a, b) => (b.cp_loss ?? 0) - (a.cp_loss ?? 0))[0];
  const masLenta = mias
    .filter((m) => m.move_time_ms !== null)
    .sort((a, b) => (b.move_time_ms ?? 0) - (a.move_time_ms ?? 0))[0];

  const hayAnalisis = moves.some((m) => m.eval_cp !== null);
  // `analizada` gobierna todo lo que la pagina muestra del motor. En modo ciego es false aunque
  // el analisis exista: es la forma de que un solo booleano apague las tres tarjetas de arriba,
  // las "Peones perdidos" y el panel de momentos clave, sin repetir la condicion en cada uno.
  const analizada = hayAnalisis && !modoCiego;

  // El ply que el motor senala como el error que definio la partida. Viaja al cliente para
  // quedar congelado en `game_reviews.ply_del_motor` al confirmar.
  const plyDelMotor = peorJugada?.ply ?? null;
  const resultado = game.result === 'win' ? 'Victoria' : game.result === 'loss' ? 'Derrota' : 'Tablas';

  const medianaMs = mediana(mias.filter((m) => m.move_time_ms !== null).map((m) => m.move_time_ms ?? 0));
  const perdidaTotal = mias
    .filter((m) => !m.is_book && !m.is_decided)
    .reduce((suma, m) => suma + (m.cp_loss ?? 0), 0);

  // ============================================================
  // El contraste: lo que creiste contra lo que dice el motor
  // ============================================================
  // Esto ES el ejercicio, no el informe. La distancia entre el ply que marcaste y el que senala
  // el motor es lo que ensena: acertar el motivo con el ply equivocado significa que reconoces
  // el error pero no cuando empezo, que es un problema distinto y se estudia distinto.
  const sanDe = (plyBuscado: number | null): string | null =>
    plyBuscado === null ? null : (moves.find((m) => m.ply === plyBuscado)?.san ?? null);

  const plyMarcado = revision?.ply_marcado ?? null;
  const plyMotorGuardado = revision?.ply_del_motor ?? null;
  const distancia =
    plyMarcado !== null && plyMotorGuardado !== null ? Math.abs(plyMarcado - plyMotorGuardado) : null;

  const contraste =
    plyMarcado === null || plyMotorGuardado === null ? null : (
      <Panel title="Lo que creíste, y lo que dice el motor">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-borde bg-panel px-3.5 py-3">
            <p className="eyebrow">Marcaste</p>
            <p className="mt-1.5 text-[17px] font-semibold">
              jugada {Math.ceil(plyMarcado / 2)}
              {sanDe(plyMarcado) ? (
                <Link href={`?ply=${plyMarcado}`} className="ml-2 font-mono text-acento hover:underline">
                  {sanDe(plyMarcado)}
                </Link>
              ) : null}
            </p>
            {revision?.motivo ? (
              <p className="mt-1 text-[12.5px] text-tenue">{NOMBRE_MOTIVO[revision.motivo]}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-borde bg-panel px-3.5 py-3">
            <p className="eyebrow">El motor dice</p>
            <p className="mt-1.5 text-[17px] font-semibold">
              jugada {Math.ceil(plyMotorGuardado / 2)}
              {sanDe(plyMotorGuardado) ? (
                <Link href={`?ply=${plyMotorGuardado}`} className="ml-2 font-mono text-acento hover:underline">
                  {sanDe(plyMotorGuardado)}
                </Link>
              ) : null}
            </p>
            <p className="mt-1 text-[12.5px] text-tenue">tu jugada más cara de la partida</p>
          </div>
        </div>
        <p className="mt-3.5 text-sm leading-relaxed">
          {distancia === 0 ? (
            <>Le achuntaste al ply exacto: viste el error mientras lo cometías.</>
          ) : distancia !== null && distancia <= 4 ? (
            <>
              Te separan {distancia} {distancia === 1 ? 'ply' : 'plies'} — estabas en la zona
              correcta de la partida.
            </>
          ) : (
            <>
              Te separan {distancia} plies. La partida ya venía decidida antes de donde la
              marcaste: mira qué pasó en la jugada {Math.ceil(plyMotorGuardado / 2)}.
            </>
          )}
        </p>
      </Panel>
    );

  const fecha = new Date(game.end_time).toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <Pagina
      preTitulo={
        <>
          <Link href="/registro" className="text-[12.5px] text-tenue hover:text-texto">
            ← Partidas
          </Link>
          <Badge>
            {game.time_class} {formatTimeControl(game.time_control)}
          </Badge>
          <Badge tono={game.result === 'win' ? 'bien' : game.result === 'loss' ? 'critico' : 'neutro'}>
            {resultado}
          </Badge>
          <Badge>{game.my_color === 'white' ? 'blancas' : 'negras'}</Badge>
        </>
      }
      titulo={
        <>
          {env.CHESSCOM_USERNAME} <span className="font-normal text-apagado">{game.my_rating}</span>
          <span className="text-apagado"> vs </span>
          {game.opp_username} <span className="font-normal text-apagado">{game.opp_rating}</span>
        </>
      }
      subtitulo={
        <>
          {fecha} · {apertura} · {Math.ceil(moves.length / 2)} jugadas · por {game.termination}
        </>
      }
      actions={
        analizada ? (
          <div className="flex gap-6 text-right">
            <div>
              <p className="eyebrow">Precisión</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums">
                {precision === null ? '—' : `${precision.toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="eyebrow">Graves</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-critico">{game.blunders ?? 0}</p>
            </div>
            <div>
              <p className="eyebrow">Errores</p>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-aviso">{game.mistakes ?? 0}</p>
            </div>
          </div>
        ) : (
          <a href={game.url} target="_blank" rel="noreferrer" className="text-xs text-tenue hover:text-texto">
            Ver en chess.com ↗
          </a>
        )
      }
    >
      <div className="space-y-6">
        {hayAnalisis ? null : (
          <p className="rounded-xl border border-aviso/40 bg-aviso/10 px-3.5 py-2.5 text-sm text-aviso">
            Esta partida todavía no la analizó el motor. Puedes navegarla igual, pero sin
            evaluación ni clasificación de jugadas.
          </p>
        )}

        {contraste}

        <GameReview
          jugadas={jugadas}
          gameId={game.id}
          baseSeconds={game.base_seconds}
          jugadorBlancas={game.my_color === 'white' ? env.CHESSCOM_USERNAME : game.opp_username}
          jugadorNegras={game.my_color === 'white' ? game.opp_username : env.CHESSCOM_USERNAME}
          orientacion={game.my_color === 'black' ? 'black' : 'white'}
          plyInicial={Number.parseInt(ply ?? '0', 10) || 0}
          ciego={modoCiego ? { plyDelMotor } : undefined}
          resumen={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Mini
                etiqueta="Tiempo por jugada"
                valor={medianaMs === null ? '—' : `${(medianaMs / 1000).toFixed(1)} s`}
                sufijo={medianaMs === null ? undefined : 'mediana'}
              />
              <Mini
                etiqueta="Fuera de libro"
                valor={ultimaDeLibro ? `jugada ${Math.ceil(ultimaDeLibro.ply / 2) + 1}` : '—'}
              />
              <Mini
                etiqueta="Peones perdidos"
                valor={analizada ? (perdidaTotal / 100).toFixed(1) : '—'}
                oculto={modoCiego}
                tono={analizada ? 'critico' : undefined}
                ayuda={
                  <>
                    Cuánto empeoró la posición sumando TUS jugadas, en peones. 100 centipeones
                    equivalen a un peón; es el mismo ACPL de /errores, sumado en vez de promediado.
                    No es material que perdiste de verdad: es lo que costó cada jugada frente a la
                    que el motor habría hecho. Deja fuera las de libro y las posiciones ya
                    decididas. Mientras más bajo, mejor.
                  </>
                }
              />
            </div>
          }
        />

        {analizada ? (
          <Panel title="Momentos clave" subtitle="Lo que decidió la partida, en tres líneas">
            <ul className="space-y-2 text-sm">
              {primeraFueraDeLibro ? (
                <li className="flex flex-wrap items-center gap-2">
                  <Badge>libro</Badge>
                  <span>
                    La teoría se acabó en{' '}
                    <Link
                      href={`?ply=${primeraFueraDeLibro.ply}`}
                      className="font-mono text-acento hover:underline"
                    >
                      {primeraFueraDeLibro.san}
                    </Link>{' '}
                    <span className="text-tenue">
                      ({primeraFueraDeLibro.is_mine ? 'tuya' : 'de tu rival'}, jugada{' '}
                      {Math.ceil(primeraFueraDeLibro.ply / 2)}): esa posición ya no está en el libro
                      de aperturas. Salirse de la teoría no es un error — el motor puede seguir de
                      acuerdo contigo.
                    </span>
                  </span>
                </li>
              ) : null}
              {peorJugada ? (
                <li className="flex flex-wrap items-center gap-2">
                  <Clasificacion valor={peorJugada.classification} />
                  <span>
                    Tu peor jugada fue{' '}
                    <Link href={`?ply=${peorJugada.ply}`} className="font-mono text-acento hover:underline">
                      {peorJugada.san}
                    </Link>{' '}
                    <span className="text-tenue">
                      en {NOMBRE_FASE[peorJugada.phase] ?? 'la partida'}: costó{' '}
                      {((peorJugada.cp_loss ?? 0) / 100).toFixed(1)} puntos
                      {peorJugada.best_uci ? ` (el motor jugaba ${peorJugada.best_uci})` : ''}.
                    </span>
                  </span>
                </li>
              ) : null}
              {masLenta ? (
                <li className="flex flex-wrap items-center gap-2">
                  <Badge tono="acento">reloj</Badge>
                  <span>
                    Donde más pensaste fue en{' '}
                    <Link href={`?ply=${masLenta.ply}`} className="font-mono text-acento hover:underline">
                      {masLenta.san}
                    </Link>{' '}
                    <span className="text-tenue">
                      ({((masLenta.move_time_ms ?? 0) / 1000).toFixed(1)}s)
                      {masLenta.classification === 3 ? ' — y aun así fue un error grave.' : '.'}
                    </span>
                  </span>
                </li>
              ) : null}
            </ul>
            {/* Mismo caso que en `Mini`: un `<details>` no va dentro de un `<p>`. */}
            <div className="mt-3 text-xs text-tenue">
              La precisión es un cálculo de esta app sobre la caída de probabilidad de victoria de
              cada jugada, no el número que reporta chess.com.
              <Ayuda>
                Se usa la fórmula pública de Lichess sobre el win% de cada jugada, promediada
                simple, excluyendo libro y posiciones ya decididas. Correlaciona con la precisión de
                chess.com pero no coincide: ellos usan CAPS, que es otra fórmula cerrada.
              </Ayuda>
            </div>
          </Panel>
        ) : null}
      </div>
    </Pagina>
  );
}
