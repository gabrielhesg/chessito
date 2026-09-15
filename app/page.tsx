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
  gamesByDay,
  healthSummary,
  monthlyActivity,
  monthlySummary,
  openingPerformance,
  ratingMaximo,
} from '@/lib/data';
import { Badge, Button, Pagina, Panel, Progreso } from '@/components/ui';
import { MonthCalendar } from '@/components/charts/MonthCalendar';
import { Sparkline } from '@/components/charts/Sparkline';

export const dynamic = 'force-dynamic';

const META_MENSUAL = 30;

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

  const rapidas = resumenMes?.n_rapid ?? 0;
  const totalMes = resumenMes?.n_games ?? 0;
  const avance = Math.min(100, Math.round((rapidas / META_MENSUAL) * 100));
  const faltan = Math.max(0, META_MENSUAL - rapidas);
  const diasDelMes = new Date(Date.UTC(anioActual, mesNumero, 0)).getUTCDate();
  const diasRestantes = Math.max(0, diasDelMes - hoy);

  // La clase con más partidas manda la tendencia de rating: mezclar bullet y rapid en una sola
  // línea compararía escalas distintas.
  const totalPorClase = new Map<string, number>();
  for (const m of meses) totalPorClase.set(m.time_class ?? '', (totalPorClase.get(m.time_class ?? '') ?? 0) + (m.n ?? 0));
  const claseDominante = [...totalPorClase.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const serieRating = meses
    .filter((m) => m.time_class === claseDominante && m.rating_at_month_end !== null)
    .sort((a, b) => (a.month_local ?? '').localeCompare(b.month_local ?? ''))
    .map((m) => m.rating_at_month_end as number);
  const ratingActual = serieRating.at(-1);
  const ratingPrevio = serieRating.at(-2);
  const deltaRating = ratingActual !== undefined && ratingPrevio !== undefined ? ratingActual - ratingPrevio : null;
  const maximo = claseDominante ? await ratingMaximo(claseDominante) : null;

  const calendario = (porDia ?? [])
    .filter((d) => d.day_local !== null)
    .map((d) => ({ dia: Number.parseInt((d.day_local as string).slice(-2), 10), partidas: d.n_games ?? 0 }));

  const peorApertura = aperturas
    .filter((a) => (a.n ?? 0) >= 20)
    .sort((a, b) => (a.score_pct_lower ?? 0) - (b.score_pct_lower ?? 0))[0];

  const temasVencidos = porTema.filter((t) => t.n > 0).slice(0, 4);
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
          {/* Plan de hoy: lo que hay que hacer, no lo que pasó. */}
          <section className="rounded-2xl border border-acento/35 bg-gradient-to-b from-acento/12 to-acento/[0.03] px-5 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <p className="eyebrow text-acento">Tu plan de hoy</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                  {vencidos > 0 || faltan > 0 ? 'Dos cosas y quedas al día' : 'Estás al día'}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-[22px] font-semibold tabular-nums">
                  {rapidas >= META_MENSUAL && vencidos === 0 ? 2 : 0}
                  <span className="text-sm text-tenue"> / 2</span>
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-tenue">completado</p>
              </div>
            </div>

            <ol className="mt-4.5 flex list-none flex-col gap-2.5 p-0">
              <li
                className={`flex items-center gap-3.5 rounded-xl border px-4 py-3.5 ${
                  vencidos > 0 ? 'border-borde-fuerte bg-panel' : 'border-bien/30 bg-bien/[0.08]'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                    vencidos > 0 ? 'border-2 border-acento' : 'bg-bien text-fondo'
                  }`}
                >
                  {vencidos > 0 ? '' : '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-medium">
                    {vencidos > 0
                      ? `${vencidos} ejercicios vencidos${temaPrincipal ? `, ${temaPrincipal.n} de ${NOMBRE_THEME[temaPrincipal.theme ?? ''] ?? 'patrón sin clasificar'}` : ''}`
                      : 'Sin ejercicios pendientes'}
                  </p>
                  {vencidos > 0 ? (
                    <p className="mt-1 font-mono text-[11.5px] text-tenue">
                      ~{Math.max(1, Math.round(vencidos))} min
                    </p>
                  ) : null}
                </div>
                {vencidos > 0 ? (
                  <Link
                    href="/entrenador"
                    className="shrink-0 rounded-lg bg-acento px-3.5 py-2 text-[12.5px] font-semibold text-fondo"
                  >
                    Entrenar
                  </Link>
                ) : null}
              </li>

              <li
                className={`flex items-center gap-3.5 rounded-xl border px-4 py-3.5 ${
                  faltan > 0 ? 'border-borde bg-panel' : 'border-bien/30 bg-bien/[0.08]'
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                    faltan > 0 ? 'border-2 border-borde-fuerte' : 'bg-bien text-fondo'
                  }`}
                >
                  {faltan > 0 ? '' : '✓'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-medium">
                    {faltan > 0 ? `Jugar ${Math.min(2, faltan)} partidas de rápida` : 'Meta del mes cumplida'}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-tenue">
                    {faltan > 0
                      ? `Te faltan ${faltan} para la meta del mes y quedan ${diasRestantes} días.`
                      : `${rapidas} de rápida este mes. Sigue jugando.`}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          {/* Tendencias: el mockup las pedía, pero comparar mes contra mes es lógica que todavía
              no existe. Se muestra la forma del bloque y se dice qué falta, en vez de inventar. */}
          <section className="grid gap-3.5 md:grid-cols-2">
            <div className="rounded-[14px] border border-borde bg-panel px-4.5 py-4">
              <p className="eyebrow text-bien">Estás mejorando</p>
              <div className="mt-3.5">
                <PendienteDeDatos>
                  Comparar mes contra mes necesita una derivación que todavía no está construida.
                  Mientras tanto, la evolución completa está en Errores y en Aperturas.
                </PendienteDeDatos>
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

          <Panel
            title="No lo olvides jugando"
            subtitle="Recordatorios sacados de tus últimas partidas"
          >
            <PendienteDeDatos>
              Todavía no está construida la derivación que convierte tus patrones de error en
              recordatorios. El bloque queda armado para cuando lo esté.
            </PendienteDeDatos>
          </Panel>
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
            <p className="mb-4 mt-2.5 text-[12.5px] text-tenue">
              {totalMes} partidas en total este mes.
            </p>
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
            <p className="eyebrow">Rating {claseDominante}</p>
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

          <section className="rounded-[14px] border border-borde bg-panel px-5 py-4.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="eyebrow">Lo próximo que vence</p>
              <span className="font-mono text-[11.5px] text-apagado">repetición espaciada</span>
            </div>
            {temasVencidos.length > 0 ? (
              <ul className="mt-3.5 flex list-none flex-col gap-2.5 p-0 text-[13px]">
                {temasVencidos.map((t) => (
                  <li key={t.theme ?? 'null'} className="flex items-center justify-between gap-2.5">
                    <span>
                      {t.n} {NOMBRE_THEME[t.theme ?? ''] ?? 'sin patrón'}
                    </span>
                    <Badge tono="critico">hoy</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3.5 text-[13px] text-tenue">Nada vencido. Vuelve cuando toque el repaso.</p>
            )}
            {vencidos > 0 ? (
              <Link
                href="/entrenador"
                className="mt-4 block rounded-[9px] bg-acento py-2.5 text-center text-[13px] font-semibold text-fondo"
              >
                Entrenar {vencidos} {vencidos === 1 ? 'posición' : 'posiciones'}
              </Link>
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
