import Link from 'next/link';
import { notFound } from 'next/navigation';
import { gameDetail, openingNames } from '@/lib/data';
import { accuracyDePartida } from '@/lib/analysis/accuracy';
import { formatTimeControl } from '@/lib/chess/timecontrol';
import { Ayuda, Badge, Clasificacion, PageHeader, Panel, Stat } from '@/components/ui';
import { GameReview, type JugadaUI } from '@/components/GameReview';

export const dynamic = 'force-dynamic';

const NOMBRE_FASE: Record<number, string> = { 0: 'la apertura', 1: 'el medio juego', 2: 'el final' };

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
  searchParams: Promise<{ ply?: string }>;
}) {
  const { id } = await params;
  const { ply } = await searchParams;
  const numeroId = Number.parseInt(id, 10);
  if (!Number.isFinite(numeroId)) notFound();

  const detalle = await gameDetail(numeroId);
  if (!detalle) notFound();

  const { game, moves } = detalle;
  const nombres = game.opening_id ? await openingNames([game.opening_id]) : new Map<string, string>();
  const apertura = game.opening_id ? (nombres.get(game.opening_id) ?? 'Sin resolver') : 'Sin resolver';

  const jugadas: JugadaUI[] = moves.map((m) => ({
    ply: m.ply,
    san: m.san,
    uci: m.uci,
    isMine: m.is_mine,
    isBook: m.is_book,
    evalCp: m.eval_cp,
    mateIn: m.mate_in,
    cpLoss: m.cp_loss,
    classification: m.classification,
    moveTimeMs: m.move_time_ms,
    clockMs: m.clock_ms,
  }));

  const mias = moves.filter((m) => m.is_mine);
  const precision = accuracyDePartida(
    mias.map((m) => ({ winPctLoss: m.win_pct_loss, isBook: m.is_book, isDecided: m.is_decided })),
  );

  // Momentos clave, la idea de Game Review: donde se sale del libro, que error definio la
  // partida, y donde se fue el reloj. Todo derivado de `moves`, sin motor extra.
  const ultimaDeLibro = [...mias].reverse().find((m) => m.is_book);
  const peorJugada = mias
    .filter((m) => !m.is_book && !m.is_decided && m.cp_loss !== null)
    .sort((a, b) => (b.cp_loss ?? 0) - (a.cp_loss ?? 0))[0];
  const masLenta = mias
    .filter((m) => m.move_time_ms !== null)
    .sort((a, b) => (b.move_time_ms ?? 0) - (a.move_time_ms ?? 0))[0];

  const analizada = moves.some((m) => m.eval_cp !== null);
  const resultado = game.result === 'win' ? 'Ganaste' : game.result === 'loss' ? 'Perdiste' : 'Tablas';

  return (
    <div className="space-y-6">
      <PageHeader
        titulo={`vs ${game.opp_username}`}
        actions={
          <a
            href={game.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-tenue hover:text-texto hover:underline"
          >
            Ver en chess.com ↗
          </a>
        }
      >
        <span className="flex flex-wrap items-center gap-2">
          <Badge tono={game.result === 'win' ? 'bien' : game.result === 'loss' ? 'critico' : 'neutro'}>
            {resultado} por {game.termination}
          </Badge>
          <Badge>{formatTimeControl(game.time_control)}</Badge>
          <Badge>{game.my_color === 'white' ? 'blancas' : 'negras'}</Badge>
          <span className="text-xs">
            {game.my_rating} vs {game.opp_rating} ·{' '}
            {new Date(game.end_time).toLocaleString('es-CL', {
              timeZone: 'America/Santiago',
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </span>
        </span>
        <span className="mt-1 block text-xs">{apertura}</span>
      </PageHeader>

      {analizada ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            etiqueta="Precisión"
            valor={precision === null ? '—' : precision.toFixed(1)}
            tono={precision === null ? undefined : precision >= 80 ? 'bien' : precision < 60 ? 'critico' : undefined}
            detalle="0 a 100, cálculo propio"
          />
          <Stat
            etiqueta="CP perdidos por jugada"
            valor={game.acpl ?? '—'}
            detalle="ACPL, la medida estándar"
          />
          <Stat
            etiqueta="Errores graves"
            valor={game.blunders ?? 0}
            tono={(game.blunders ?? 0) > 0 ? 'critico' : 'bien'}
            detalle={`${game.mistakes ?? 0} errores · ${game.inaccuracies ?? 0} imprecisiones`}
          />
          <Stat
            etiqueta="Te saliste de la teoría"
            valor={game.divergence_ply ? `ply ${game.divergence_ply}` : '—'}
            detalle="donde la evaluación empezó a caer"
          />
        </div>
      ) : (
        <p className="rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">
          Esta partida todavía no la analizó el motor. Puedes navegarla igual, pero sin evaluación
          ni clasificación de jugadas.
        </p>
      )}

      <Panel
        title="Partida"
        subtitle="Click en el gráfico o en una jugada para saltar a esa posición. También funcionan las flechas del teclado."
      >
        <GameReview
          jugadas={jugadas}
          orientacion={game.my_color === 'black' ? 'black' : 'white'}
          plyInicial={Number.parseInt(ply ?? '0', 10) || 0}
        />
      </Panel>

      {analizada ? (
        <Panel title="Momentos clave" subtitle="Lo que decidió la partida, en tres líneas">
          <ul className="space-y-2 text-sm">
            {ultimaDeLibro ? (
              <li className="flex flex-wrap items-center gap-2">
                <Badge>libro</Badge>
                <span>
                  Tu última jugada de teoría fue{' '}
                  <Link href={`?ply=${ultimaDeLibro.ply}`} className="font-mono text-acento hover:underline">
                    {ultimaDeLibro.san}
                  </Link>{' '}
                  <span className="text-tenue">(ply {ultimaDeLibro.ply}). De ahí en adelante jugaste solo.</span>
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
          <p className="mt-3 text-xs text-tenue">
            La precisión es un cálculo de esta app sobre la caída de probabilidad de victoria de
            cada jugada, no el número que reporta chess.com.
            <Ayuda>
              Se usa la fórmula pública de Lichess sobre el win% de cada jugada, promediada
              simple, excluyendo libro y posiciones ya decididas. Correlaciona con la precisión de
              chess.com pero no coincide: ellos usan CAPS, que es otra fórmula cerrada.
            </Ayuda>
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
