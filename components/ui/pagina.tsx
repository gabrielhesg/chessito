import type { ReactNode } from 'react';

/**
 * El armazon de toda pantalla: una cabecera a lo ancho con linea inferior, y debajo el
 * contenido. Reemplaza al `<div className="space-y-6">` + `<PageHeader>` que cada pagina repetia,
 * y es lo que hace que la barra lateral y el contenido compartan la misma altura de cabecera.
 */
export function Pagina({
  titulo,
  preTitulo,
  subtitulo,
  actions,
  children,
}: {
  titulo: ReactNode;
  /** Una fila de migas y etiquetas sobre el titulo: volver, control de tiempo, resultado. */
  preTitulo?: ReactNode;
  /** Una linea corta bajo el titulo: fecha, cobertura, de donde salen los numeros. */
  subtitulo?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-borde px-5 py-4 sm:px-7">
        <div className="min-w-0">
          {preTitulo ? <div className="mb-2 flex flex-wrap items-center gap-2.5">{preTitulo}</div> : null}
          <h1 className="text-[21px] font-semibold tracking-[-0.025em]">{titulo}</h1>
          {subtitulo ? <p className="mt-1 max-w-[86ch] text-[12.5px] leading-relaxed text-tenue">{subtitulo}</p> : null}
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0">{actions}</div> : null}
      </header>
      <div className="px-5 py-6 sm:px-7">{children}</div>
    </div>
  );
}
