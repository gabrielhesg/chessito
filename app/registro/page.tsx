import Link from 'next/link';
import { listGames, openingNames } from '@/lib/data';
import { formatTimeControl } from '@/lib/chess/timecontrol';
import { Badge, EmptyState, Fila, PageHeader, Panel, SortableTh, Tabla, Td } from '@/components/ui';

export const dynamic = 'force-dynamic';

const CLASES = ['rapid', 'blitz', 'bullet', 'daily'] as const;
const RESULTADOS = { win: 'ganadas', loss: 'perdidas', draw: 'tablas' } as const;

function esColor(value: string | undefined): value is 'white' | 'black' {
  return value === 'white' || value === 'black';
}
function esResultado(value: string | undefined): value is keyof typeof RESULTADOS {
  return value === 'win' || value === 'loss' || value === 'draw';
}

function Filtro({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={activo ? 'true' : undefined}
      className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
        activo
          ? 'border-acento bg-acento/10 font-medium text-acento'
          : 'border-borde text-tenue hover:border-borde-fuerte hover:text-texto'
      }`}
    >
      {children}
    </Link>
  );
}

const SORT_COLUMNAS = ['end_time', 'my_rating'] as const;
type SortColumna = (typeof SORT_COLUMNAS)[number];
function esSortColumna(value: string | undefined): value is SortColumna {
  return SORT_COLUMNAS.includes(value as SortColumna);
}

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ clase?: string; color?: string; resultado?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const timeClass = CLASES.find((c) => c === params.clase);
  const color = esColor(params.color) ? params.color : undefined;
  const result = esResultado(params.resultado) ? params.resultado : undefined;
  const sort: SortColumna = esSortColumna(params.sort) ? params.sort : 'end_time';
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc';

  const { rows, total } = await listGames({ timeClass, color, result, sort, dir, limit: 100 });
  const nombres = await openingNames(rows.map((r) => r.opening_id).filter((id): id is string => id !== null));

  const link = (patch: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const merged = { clase: timeClass, color, resultado: result, sort, dir, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) next.set(key, value);
    const query = next.toString();
    return query ? `/registro?${query}` : '/registro';
  };
  const sortLink = (nextSort: string, nextDir: 'asc' | 'desc'): string => link({ sort: nextSort, dir: nextDir });

  const hayFiltro = Boolean(timeClass || color || result);

  return (
    <div className="space-y-6">
      <PageHeader titulo="Partidas">
        {total.toLocaleString('es-CL')} partidas con estos filtros. Se muestran las 100 más
        recientes.
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2">
        <Filtro href={link({ clase: undefined })} activo={!timeClass}>
          todas
        </Filtro>
        {CLASES.map((c) => (
          <Filtro key={c} href={link({ clase: c })} activo={timeClass === c}>
            {c}
          </Filtro>
        ))}
        <span aria-hidden className="mx-1 h-4 w-px bg-borde" />
        <Filtro href={link({ color: undefined })} activo={!color}>
          ambos colores
        </Filtro>
        <Filtro href={link({ color: 'white' })} activo={color === 'white'}>
          blancas
        </Filtro>
        <Filtro href={link({ color: 'black' })} activo={color === 'black'}>
          negras
        </Filtro>
        <span aria-hidden className="mx-1 h-4 w-px bg-borde" />
        <Filtro href={link({ resultado: undefined })} activo={!result}>
          todo resultado
        </Filtro>
        {(Object.keys(RESULTADOS) as (keyof typeof RESULTADOS)[]).map((r) => (
          <Filtro key={r} href={link({ resultado: r })} activo={result === r}>
            {RESULTADOS[r]}
          </Filtro>
        ))}
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            titulo="Ninguna partida con estos filtros"
            detalle={hayFiltro ? 'Prueba quitando alguno de los filtros de arriba.' : undefined}
            accion={
              hayFiltro ? (
                <Link href="/registro" className="text-xs text-acento hover:underline">
                  Quitar todos los filtros
                </Link>
              ) : null
            }
          />
        ) : (
          <Tabla
            aligns={['text', 'text', 'text', 'text', 'text', 'num', 'text', 'text']}
            headers={[
              <SortableTh
                key="fecha"
                label="Fecha"
                sortKey="end_time"
                currentSort={sort}
                currentDir={dir}
                href={sortLink}
              />,
              'Tipo',
              'Color',
              'Resultado',
              'Rival',
              <SortableTh
                key="rating"
                label="Rating"
                sortKey="my_rating"
                currentSort={sort}
                currentDir={dir}
                href={sortLink}
              />,
              'Apertura',
              '',
            ]}
          >
            {rows.map((g) => (
              <Fila key={g.id}>
                <Td className="whitespace-nowrap tabular-nums text-tenue">
                  {new Date(g.end_time).toLocaleString('es-CL', {
                    timeZone: 'America/Santiago',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </Td>
                <Td className="whitespace-nowrap">
                  <Badge>{formatTimeControl(g.time_control)}</Badge>
                </Td>
                <Td>
                  <span
                    aria-hidden
                    className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${
                      g.my_color === 'white' ? 'bg-ventaja-blancas' : 'border border-borde-fuerte bg-ventaja-negras'
                    }`}
                  />
                  {g.my_color === 'white' ? 'blancas' : 'negras'}
                </Td>
                <Td>
                  <Badge tono={g.result === 'win' ? 'bien' : g.result === 'loss' ? 'critico' : 'neutro'}>
                    {g.result === 'win' ? 'ganó' : g.result === 'loss' ? 'perdió' : 'tablas'}
                  </Badge>
                  <span className="ml-1.5 text-2xs text-apagado">{g.termination}</span>
                </Td>
                <Td className="whitespace-nowrap">{g.opp_username}</Td>
                <Td num className="whitespace-nowrap">
                  {g.my_rating} <span className="text-apagado">vs</span> {g.opp_rating}
                </Td>
                <Td className="max-w-[16rem] truncate text-tenue">
                  {g.opening_id ? (nombres.get(g.opening_id) ?? 'Sin resolver') : 'Sin resolver'}
                </Td>
                <Td>
                  <a
                    className="whitespace-nowrap text-xs text-tenue hover:text-texto hover:underline"
                    href={g.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    chess.com ↗
                  </a>
                </Td>
              </Fila>
            ))}
          </Tabla>
        )}
      </Panel>
    </div>
  );
}
