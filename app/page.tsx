import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { ChesscomClient } from '@/lib/chess/chesscom';
import { appEnv, env } from '@/lib/env';
import { runIngest } from '@/lib/ingest/run';
import { SupabaseIngestStore } from '@/lib/ingest/supabase-store';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  dueByTheme,
  dueCount,
  formatosDeRapida,
  gamesByDay,
  healthSummary,
  medianaPorEjercicioMs,
  monthlyActivity,
  monthlySummary,
  openingPerformance,
  rapidasDeHoy,
  ratingMaximo,
  derrotasSinRevisar,
} from '@/lib/data';
import { formatTimeControl } from '@/lib/chess/timecontrol';
import { Button, Pagina, Progreso } from '@/components/ui';
import { MonthCalendar } from '@/components/charts/MonthCalendar';
import { Sparkline } from '@/components/charts/Sparkline';

export const dynamic = 'force-dynamic';

const META_MENSUAL = 30;

/**
 * Cuantos ejercicios son una sesion. La portada muestra ESTO, nunca la cola completa: con 397
 * vencidos el "plan de hoy" decia "~397 min", o sea seis horas y media, que no es un plan sino
 * una razon para cerrar la app. El atraso de repeticion espaciada es la falla tipica del
 * metodo (Chessable lo documenta) y mostrarlo entero en la primera pantalla es su forma extrema.
 */
const EJERCICIOS_POR_SESION = 10;

/** La clase de tiempo del plan de entrenamiento. Todo lo que mide esta pagina cuenta esta. */
const CLASE = 'rapid';

const NOMBRE_THEME: Record<string, string> = {
  pieza_colgada: 'piezas colgadas',
  mate_pasillo: 'mate del pasillo',
  permite_horquilla: 'permite horquilla',
};

function saludo(hora: number): string {
  if (hora < 12) return 'Buenos días';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Una de las tres tareas del dia. Todas se pueden terminar HOY, y por eso se pueden marcar. */
/** Fecha corta en la zona del unico usuario. `end_time` viene como texto ISO desde PostgREST. */
function fechaCorta(endTime: string | null): string {
  if (endTime === null) return '—';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: 'numeric',
    month: 'short',
  }).format(new Date(endTime));
}

function TareaDeHoy({
  hecha,
  titulo,
  detalle,
  accion,
}: {
  hecha: boolean;
  titulo: string;
  detalle: string | null;
  accion: React.ReactNode;
}) {
  return (
    <li
      className={`flex items-center gap-3.5 rounded-xl border px-4 py-3.5 ${
        hecha ? 'border-bien/30 bg-bien/[0.08]' : 'border-borde-fuerte bg-panel'
      }`}
    >
      <span
        aria-hidden
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
          hecha ? 'bg-bien text-fondo' : 'border-2 border-acento'
        }`}
      >
        {hecha ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-medium">{titulo}</p>
        {detalle ? <p className="mt-0.5 text-[12.5px] text-tenue">{detalle}</p> : null}
      </div>
      {accion}
    </li>
  );
}

/** Un bloque cuyo dato todavía no existe: se muestra la forma, no un número inventado. */
function PendienteDeDatos({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-borde px-3.5 py-4 text-center text-xs leading-relaxed text-apagado">
      {children}
    </p>
  );
}

/**
 * La portada. El número principal sigue siendo "partidas de rápida este mes" y no la tasa de
 * blunders: el riesgo real del proyecto es que construir la app reemplace a jugar ajedrez, así
 * que esta pantalla tiene que empujar a jugar.
 *
 * NO lleva racha de días seguidos, aunque el mockup la tenía: la regla del proyecto es "sin
 * gamificación, rachas ni notificaciones", y una racha premia abrir la app, que es justo el
 * comportamiento que la regla existe para no fomentar.
 */
export default async function Portada() {
  const ahora = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // formatToParts devuelve un arreglo posicional; buscar por `type` es lo unico estable frente a
  // como el runtime ordene los separadores.
  const partes = fmt.formatToParts(ahora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  const mesActual = `${parte('year')}-${parte('month')}`;
  const hoy = Number.parseInt(parte('day') || '1', 10);
  const anioActual = Number.parseInt(parte('year'), 10);
  const mesNumero = Number.parseInt(parte('month'), 10);
  const horaLocal = Number.parseInt(
    new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }).format(ahora),
    10,
  );

  const [meses, salud, resumenMes, porDia, vencidos, porTema, aperturas] = await Promise.all([
    monthlyActivity(),
    healthSummary(),
    monthlySummary(mesActual),
    // `v_games_by_day` la crea la migracion 0008. Si todavia no se aplico, el calendario se
    // degrada a su bloque vacio en vez de tumbar la portada entera.
    gamesByDay(mesActual).catch(() => null),
    dueCount(),
    dueByTheme(),
    openingPerformance(),
  ]);

  // Lecturas que agrega la Fase 1 de la revision. Van con `.catch` porque ninguna es fatal: sin
  // ellas el bloque se degrada, y una portada caida por un dato de apoyo es peor que una
  // portada incompleta (misma leccion que /entrenador en la Fase 7).
  const [colaDeDerrotas, jugadasHoy, formatos, msPorEjercicio] = await Promise.all([
    // Tres, no la cola completa: mostrar las 40 pendientes es mostrar una deuda, y una deuda no
    // se empieza. Misma leccion que los 397 ejercicios vencidos.
    derrotasSinRevisar(3).catch(() => []),
    rapidasDeHoy().catch(() => 0),
    formatosDeRapida(mesActual).catch(() => []),
    medianaPorEjercicioMs().catch(() => null),
  ]);

  const rapidas = resumenMes?.n_rapid ?? 0;
  const totalMes = resumenMes?.n_games ?? 0;
  const balaMes = resumenMes?.n_bullet ?? 0;
  const avance = Math.min(100, Math.round((rapidas / META_MENSUAL) * 100));
  const faltan = Math.max(0, META_MENSUAL - rapidas);
  const diasDelMes = new Date(Date.UTC(anioActual, mesNumero, 0)).getUTCDate();
  const diasRestantes = Math.max(0, diasDelMes - hoy);

  // La meta del DIA se deriva de lo que falta y los dias que quedan. Un "2 partidas" fijo no
  // cierra con la meta mensual (2 x 30 = 60 contra una meta de 30) y se aprende a ignorar.
  const metaDeHoy = faltan === 0 ? 0 : Math.max(1, Math.ceil(faltan / Math.max(1, diasRestantes + 1)));

  // El rating grande es SIEMPRE el de rapida. Antes se elegia la clase por volumen sobre las
  // filas que devolvia `monthlyActivity()`, y con el `limit` por filas esa ventana eran ~8
  // meses: justo aquellos en que dejo la rapida. El resultado era un "RATING BLITZ" como numero
  // principal de la pantalla que existe para empujar a jugar rapida.
  const serieRating = meses
    .filter((m) => m.time_class === CLASE && m.rating_at_month_end !== null)
    .sort((a, b) => (a.month_local ?? '').localeCompare(b.month_local ?? ''))
    .map((m) => m.rating_at_month_end as number);
  const ratingActual = serieRating.at(-1);
  const ratingPrevio = serieRating.at(-2);
  const deltaRating = ratingActual !== undefined && ratingPrevio !== undefined ? ratingActual - ratingPrevio : null;
  const maximo = await ratingMaximo(CLASE).catch(() => null);

  const calendario = (porDia ?? [])
    .filter((d) => d.day_local !== null)
    .map((d) => ({
      dia: Number.parseInt((d.day_local as string).slice(-2), 10),
      partidas: d.n_rapid ?? 0,
      otras: Math.max(0, (d.n_games ?? 0) - (d.n_rapid ?? 0)),
    }));

  // La peor apertura, SOLO de rapida: la lista mezclaba las tres clases, asi que "esto no
  // mejora" podia estar senalando una linea que solo juega en bala.
  const peorApertura = aperturas
    .filter((a) => a.time_class === CLASE && (a.n ?? 0) >= 20)
    .sort((a, b) => (a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0))[0];

  const ejerciciosDeHoy = Math.min(EJERCICIOS_POR_SESION, vencidos);
  const minutosSesion =
    msPorEjercicio === null
      ? null
      : Math.max(1, Math.round((msPorEjercicio * ejerciciosDeHoy) / 60_000));

  // Las tres tareas del dia, todas terminables HOY. El contador viejo era
  // `rapidas >= META_MENSUAL && vencidos === 0 ? 2 : 0`: solo podia valer 0 o 2, dependia de la
  // meta del MES y de la deuda COMPLETA de repeticion espaciada, y seguia diciendo 0/2 despues
  // de jugar y de entrenar.
  // La primera es la tarea del dia; las otras dos van en una lista chica debajo. `n_total` lo
  // calcula la vista con una ventana, asi que "y 37 mas" no cuesta una segunda consulta.
  const derrotaPendiente = colaDeDerrotas[0] ?? null;
  const otrasDerrotas = colaDeDerrotas.slice(1);
  const restantes = Math.max(0, (derrotaPendiente?.n_total ?? 0) - colaDeDerrotas.length);

  const tareas = [
    { hecha: metaDeHoy === 0 || jugadasHoy >= metaDeHoy },
    { hecha: colaDeDerrotas.length === 0 },
    { hecha: ejerciciosDeHoy === 0 },
  ];
  const hechas = tareas.filter((t) => t.hecha).length;

  // Solo temas CON NOMBRE. El grupo `theme = null` es el residuo del detector de patrones (202
  // de los 397 ejercicios), y mostrarlo como "Sin patrón · 202 vencidos" en el bloque de
  // debilidades es nombrar una debilidad que no existe: es lo que el detector no reconocio, no
  // algo que el jugador haga mal. Mismo criterio que el panel del entrenador.
  const temasVencidos = porTema.filter((t) => t.n > 0 && t.theme !== null).slice(0, 4);
  const temaPrincipal = temasVencidos[0];

  async function actualizarAhora(): Promise<void> {
    'use server';
    await runIngest({
      store: new SupabaseIngestStore(supabaseAdmin()),
      client: new ChesscomClient({ username: env.CHESSCOM_USERNAME }),
      username: env.CHESSCOM_USERNAME,
      environment: appEnv(),
      trigger: 'manual',
      scope: { kind: 'recent' },
    });
    revalidatePath('/');
  }

  const fechaLarga = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(ahora);

  return (
    <Pagina
      titulo={`${saludo(horaLocal)}, ${env.CHESSCOM_USERNAME}`}
      subtitulo={
        <>
          {fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}
          {salud?.ingest_hours_old !== null && salud?.ingest_hours_old !== undefined
            ? ` · última ingesta hace ${salud.ingest_hours_old} h`
            : ''}
          {diasRestantes > 0 ? ` · quedan ${diasRestantes} días de mes` : ' · último día del mes'}
        </>
      }
      actions={
        <form action={actualizarAhora}>
          <Button type="submit" variante="primario" pendingLabel="Actualizando…">
            Actualizar ahora
          </Button>
        </form>
      }
    >
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4.5">
          {/* Plan de hoy: TRES cosas, todas terminables hoy. La lista va en el orden de lo que
              mueve el rating: jugar, revisar la derrota, entrenar. Jugar va primero porque es
              lo que la app existe para proteger, y hasta ahora era la unica tarea sin boton. */}
          <section className="rounded-2xl border border-acento/35 bg-gradient-to-b from-acento/12 to-acento/[0.03] px-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="eyebrow text-acento">Tu plan de hoy</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                  {hechas === tareas.length ? 'Listo por hoy' : 'Tres cosas y quedas al día'}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-[22px] font-semibold tabular-nums">
                  {hechas}
                  <span className="text-sm text-tenue"> / {tareas.length}</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-tenue">hoy</p>
              </div>
            </div>

            <ol className="mt-4.5 flex list-none flex-col gap-2.5 p-0">
              <TareaDeHoy
                hecha={tareas[0]?.hecha ?? false}
                titulo={
                  metaDeHoy === 0
                    ? 'Meta del mes cumplida'
                    : `Jugar ${metaDeHoy} ${metaDeHoy === 1 ? 'partida' : 'partidas'} de rápida`
                }
                detalle={
                  metaDeHoy === 0
                    ? `${rapidas} de rápida este mes. Sigue jugando.`
                    : `Llevas ${jugadasHoy} hoy · ${rapidas} de ${META_MENSUAL} este mes, y quedan ${diasRestantes} días.`
                }
                accion={
                  metaDeHoy === 0 ? null : (
                    <a
                      href="https://www.chess.com/play/online"
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg bg-acento px-3.5 py-2 text-[12.5px] font-semibold text-fondo"
                    >
                      Jugar ↗
                    </a>
                  )
                }
              />

              <TareaDeHoy
                hecha={tareas[1]?.hecha ?? false}
                titulo={
                  derrotaPendiente
                    ? `Revisar tu derrota contra ${derrotaPendiente.opp_username}`
                    : 'Ninguna derrota de rápida por revisar'
                }
                detalle={
                  derrotaPendiente
                    ? `${derrotaPendiente.time_control === null ? 'rápida' : formatTimeControl(derrotaPendiente.time_control)} · con ${derrotaPendiente.my_color === 'white' ? 'blancas' : 'negras'} · ${fechaCorta(derrotaPendiente.end_time)}${restantes > 0 ? ` · y ${restantes} más sin revisar` : ''}`
                    : 'Al día con el ritual: toda derrota se analiza.'
                }
                accion={
                  derrotaPendiente ? (
                    <Link
                      href={`/partida/${derrotaPendiente.id}`}
                      className="shrink-0 rounded-lg border border-borde-fuerte px-3.5 py-2 text-[12.5px] font-semibold"
                    >
                      Revisar
                    </Link>
                  ) : null
                }
              />

              {otrasDerrotas.length > 0 ? (
                <li className="rounded-xl border border-borde bg-panel/60 px-4 py-2.5">
                  <p className="text-2xs text-apagado">Después de esa</p>
                  <ul className="mt-1.5 space-y-1">
                    {otrasDerrotas.map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="min-w-0 truncate text-tenue">
                          contra {d.opp_username} · {fechaCorta(d.end_time)}
                        </span>
                        <Link href={`/partida/${d.id}`} className="shrink-0 text-acento">
                          Revisar
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : null}

              <TareaDeHoy
                hecha={tareas[2]?.hecha ?? false}
                titulo={
                  ejerciciosDeHoy > 0
                    ? `${ejerciciosDeHoy} ejercicios${temaPrincipal ? `, ${Math.min(ejerciciosDeHoy, temaPrincipal.n)} de ${NOMBRE_THEME[temaPrincipal.theme ?? ''] ?? 'patrón sin clasificar'}` : ''}`
                    : 'Sin ejercicios pendientes'
                }
                detalle={
                  ejerciciosDeHoy > 0 && minutosSesion !== null
                    ? `~${minutosSesion} min, medido con tus propios intentos.`
                    : null
                }
                accion={
                  ejerciciosDeHoy > 0 ? (
                    <Link
                      href="/entrenador"
                      className="shrink-0 rounded-lg bg-acento px-3.5 py-2 text-[12.5px] font-semibold text-fondo"
                    >
                      Entrenar
                    </Link>
                  ) : null
                }
              />
            </ol>
          </section>

          {/* Tendencias: el mockup las pedía, pero comparar mes contra mes es lógica que todavía
              no existe. Se muestra la forma del bloque y se dice qué falta, en vez de inventar. */}
          <section className="grid gap-3.5 md:grid-cols-2">
            <div className="rounded-[14px] border border-borde bg-panel px-4.5 py-4">
              <p className="eyebrow text-bien">Tu rápida contra tu propio máximo</p>
              <div className="mt-3.5">
                {ratingActual !== undefined && maximo ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span>Hoy</span>
                      <span className="font-mono tabular-nums">{ratingActual.toLocaleString('es-CL')}</span>
                    </div>
                    <div className="mt-1.5">
                      <Progreso
                        valor={Math.min(100, (ratingActual / maximo) * 100)}
                        tono={ratingActual >= maximo ? 'bien' : 'acento'}
                        alto="h-1.5"
                      />
                    </div>
                    <p className="mt-2 text-[12.5px] text-tenue">
                      Tu máximo es {maximo.toLocaleString('es-CL')}
                      {ratingActual < maximo
                        ? `, o sea ${(maximo - ratingActual).toLocaleString('es-CL')} puntos arriba. Lo alcanzaste el mes en que más rápida jugaste.`
                        : '. Estás en tu mejor momento.'}
                    </p>
                  </>
                ) : (
                  <PendienteDeDatos>
                    Aparece cuando haya al menos un mes con partidas de rápida.
                  </PendienteDeDatos>
                )}
              </div>
            </div>
            <div className="rounded-[14px] border border-borde bg-panel px-4.5 py-4">
              <p className="eyebrow text-critico">Esto no mejora</p>
              <ul className="mt-3.5 flex list-none flex-col gap-3 p-0">
                {peorApertura ? (
                  <li>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate">{peorApertura.opening_name}</span>
                      <span className="shrink-0 font-mono text-critico">
                        {((peorApertura.score_pct ?? 0) * 100).toFixed(0)}% en {peorApertura.n}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Progreso valor={(peorApertura.score_pct ?? 0) * 100} tono="critico" alto="h-1.5" />
                    </div>
                  </li>
                ) : null}
                {temaPrincipal ? (
                  <li>
                    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className="min-w-0 truncate">
                        {NOMBRE_THEME[temaPrincipal.theme ?? ''] ?? 'Sin patrón'} (ejercicios)
                      </span>
                      <span className="shrink-0 font-mono text-critico">{temaPrincipal.n} vencidos</span>
                    </div>
                    <div className="mt-1.5">
                      <Progreso
                        valor={vencidos > 0 ? (temaPrincipal.n / vencidos) * 100 : 0}
                        tono="critico"
                        alto="h-1.5"
                      />
                    </div>
                  </li>
                ) : null}
                {!peorApertura && !temaPrincipal ? (
                  <PendienteDeDatos>
                    Sin cortes con muestra suficiente todavía. Aparece cuando haya aperturas con 20
                    partidas o ejercicios vencidos.
                  </PendienteDeDatos>
                ) : null}
              </ul>
            </div>
          </section>

        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-[14px] border border-borde bg-panel px-5 py-4.5">
            <div className="flex items-baseline justify-between">
              <p className="eyebrow">Rápida este mes</p>
              <span className="font-mono text-[11.5px] text-apagado">meta {META_MENSUAL}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2.5">
              <span className="text-[44px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                {rapidas}
              </span>
              <span className="text-sm text-tenue">
                {faltan > 0 ? `van ${faltan} para la meta` : 'meta cumplida'}
              </span>
            </div>
            <div className="mt-3.5">
              <Progreso valor={avance} />
            </div>
            {/* El numero que no tenia nombre. 436 de bala en un mes con 15 de rapida salian
                como "455 partidas en total" en gris chico: la unica cifra del mes sin etiqueta,
                y justo la que el plan de entrenamiento prohibe. Va el hecho, sin castigo y sin
                racha. */}
            <div className="mb-4 mt-2.5 space-y-1 text-[12.5px] text-tenue">
              {formatos.length > 0 ? (
                <p>
                  {formatos.map((f, i) => (
                    <span key={f.timeControl}>
                      {i > 0 ? ' · ' : ''}
                      <span className="tabular-nums">{f.n}</span> en {formatTimeControl(f.timeControl)}
                    </span>
                  ))}
                </p>
              ) : null}
              {balaMes > 0 ? (
                <p className="text-apagado">
                  <span className="tabular-nums text-tenue">{balaMes}</span> de bala este mes. Tu
                  plan dice cero hasta 1500.
                </p>
              ) : null}
              <p className="text-apagado">{totalMes} partidas en total, de todas las clases.</p>
            </div>
            {porDia === null ? (
              <PendienteDeDatos>
                El calendario necesita la vista <code>v_games_by_day</code>, que agrega la
                migración 0008. Corre <code>pnpm db:push</code> y vuelve.
              </PendienteDeDatos>
            ) : (
              <MonthCalendar anio={anioActual} mes={mesNumero} dias={calendario} hoy={hoy} />
            )}
          </section>

          <section className="rounded-[14px] border border-borde bg-panel px-5 py-4.5">
            <p className="eyebrow">Rating de rápida</p>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <span className="text-[30px] font-semibold tracking-[-0.03em] tabular-nums">
                {ratingActual?.toLocaleString('es-CL') ?? '—'}
              </span>
              {deltaRating !== null ? (
                <span className={`font-mono text-[12.5px] ${deltaRating >= 0 ? 'text-bien' : 'text-critico'}`}>
                  {deltaRating >= 0 ? '+' : ''}
                  {deltaRating}
                </span>
              ) : null}
              {maximo ? (
                <span className="ml-auto font-mono text-[11.5px] text-apagado">
                  máx {maximo.toLocaleString('es-CL')}
                </span>
              ) : null}
            </div>
            {serieRating.length >= 2 ? (
              <div className="mt-3">
                <Sparkline valores={serieRating} alto={64} area tono="acento" />
              </div>
            ) : null}
          </section>

          <Link
            href="/salud"
            className="flex items-center justify-between gap-2.5 rounded-[14px] border border-borde bg-lateral px-4.5 py-3.5 transition-colors hover:border-borde-fuerte"
          >
            <div>
              <p className="text-[12.5px] text-tenue">Sistema</p>
              <p className="mt-0.5 text-[13px]">
                {(salud?.checks_total ?? 0) - (salud?.checks_failing ?? 0)}/{salud?.checks_total ?? 0} chequeos ·{' '}
                {(salud?.n_pending ?? 0).toLocaleString('es-CL')} por analizar
              </p>
            </div>
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${salud?.checks_failing ? 'bg-critico' : 'bg-bien'}`}
            />
          </Link>
        </div>
      </div>
    </Pagina>
  );
}
