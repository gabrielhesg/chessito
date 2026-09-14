import Link from 'next/link';
import { listGames, openingNames } from '@/lib/data';
import { formatTimeControl } from '@/lib/chess/timecontrol';
import { Panel, SortableTh, Tabla, Vacio } from '@/components/ui';

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
      className={`rounded border px-2 py-0.5 text-xs ${
        activo
          ? 'border-[var(--color-texto)] text-[var(--color-texto)]'
          : 'border-[var(--color-borde)] text-[var(--color-tenue)]'
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Registro</h1>
        <p className="mt-1 text-sm text-[var(--color-tenue)]">
          {total} partidas con estos filtros. Se muestran las 100 mas recientes.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Filtro href={link({ clase: undefined })} activo={!timeClass}>todas</Filtro>
        {CLASES.map((c) => (
          <Filtro key={c} href={link({ clase: c })} activo={timeClass === c}>{c}</Filtro>
        ))}
        <span className="w-full" />
        <Filtro href={link({ color: undefined })} activo={!color}>ambos colores</Filtro>
        <Filtro href={link({ color: 'white' })} activo={color === 'white'}>blancas</Filtro>
        <Filtro href={link({ color: 'black' })} activo={color === 'black'}>negras</Filtro>
        <span className="w-full" />
        <Filtro href={link({ resultado: undefined })} activo={!result}>todo resultado</Filtro>
        {(Object.keys(RESULTADOS) as (keyof typeof RESULTADOS)[]).map((r) => (
          <Filtro key={r} href={link({ resultado: r })} activo={result === r}>{RESULTADOS[r]}</Filtro>
        ))}
      </div>

      <Panel title="Partidas">
        {rows.length === 0 ? (
          <Vacio>Ninguna partida con estos filtros.</Vacio>
        ) : (
          <Tabla
            headers={[
              <SortableTh key="fecha" label="Fecha" sortKey="end_time" currentSort={sort} currentDir={dir} href={sortLink} />,
              'Tipo',
              'Color',
              'Resultado',
              'Final',
              'Rival',
              <SortableTh key="rating" label="Rating" sortKey="my_rating" currentSort={sort} currentDir={dir} href={sortLink} />,
              'Apertura',
              '',
            ]}
          >
            {rows.map((g) => (
              <tr key={g.id} className="border-b border-[var(--color-borde)]/50">
                <td className="py-1.5 pr-3 tabular-nums">
                  {new Date(g.end_time).toLocaleString('es-CL', {
                    timeZone: 'America/Santiago',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="py-1.5 pr-3">{g.time_class} {formatTimeControl(g.time_control)}</td>
                <td className="py-1.5 pr-3">{g.my_color === 'white' ? 'blancas' : 'negras'}</td>
                <td
                  className={`py-1.5 pr-3 ${
                    g.result === 'win'
                      ? 'text-[var(--color-bien)]'
                      : g.result === 'loss'
                        ? 'text-[var(--color-mal)]'
                        : ''
                  }`}
                >
                  {g.result === 'win' ? 'gana' : g.result === 'loss' ? 'pierde' : 'tablas'}
                </td>
                <td className="py-1.5 pr-3 text-[var(--color-tenue)]">{g.termination}</td>
                <td className="py-1.5 pr-3">{g.opp_username}</td>
                <td className="py-1.5 pr-3 tabular-nums">{g.my_rating} vs {g.opp_rating}</td>
                <td className="py-1.5 pr-3">{g.opening_id ? (nombres.get(g.opening_id) ?? 'Sin resolver') : 'Sin resolver'}</td>
                <td className="py-1.5 pr-3">
                  <a className="text-[var(--color-tenue)] underline" href={g.url} target="_blank" rel="noreferrer">
                    ver
                  </a>
                </td>
              </tr>
            ))}
          </Tabla>
        )}
      </Panel>
    </div>
  );
}
