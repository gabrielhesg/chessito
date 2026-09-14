export type BarraV = {
  /** Etiqueta bajo la columna. Se muestra cada `cadaCuantasEtiquetas`, para no amontonar. */
  etiqueta: string;
  valor: number | null;
  /** Tamano de muestra: bajo el umbral la columna sale atenuada y sin recomendacion. */
  n?: number;
  titulo?: string;
};

/**
 * Columnas verticales, en HTML. Para series ordenadas en el eje x donde la etiqueta es corta:
 * hora del dia, numero de partida en la sesion, rango de tiempo, ply.
 *
 * Un solo color para toda la serie (ver la nota en `BarrasH`): la comparacion la hace la altura
 * y la linea de referencia, no el color. `referencia` dibuja el "neutro" (por ejemplo 50% de
 * rendimiento), que es lo que convierte la lectura de "cuanto" a "mejor o peor de lo normal".
 */
export function BarrasV({
  datos,
  max,
  referencia,
  /** Sufijo de las marcas del eje y: '%', 's', ''. */
  unidad = '',
  alto = 'h-28',
  cadaCuantasEtiquetas = 1,
}: {
  datos: readonly BarraV[];
  max: number;
  referencia?: number;
  unidad?: string;
  alto?: string;
  cadaCuantasEtiquetas?: number;
}) {
  const tope = max > 0 ? max : 1;
  const formatear = (v: number): string => (v >= 10 ? v.toFixed(0) : v.toFixed(1));

  return (
    <div className="flex gap-2">
      {/* Eje y: sin esto la altura de la columna no significa nada concreto. */}
      <div className={`flex ${alto} w-8 shrink-0 flex-col justify-between text-right text-2xs tabular-nums text-apagado`}>
        <span>
          {formatear(tope)}
          {unidad}
        </span>
        <span>0{unidad}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className={`relative flex ${alto} items-end gap-[2px] border-b border-eje`}>
          {referencia !== undefined ? (
            <div
              className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-borde-fuerte"
              style={{ bottom: `${(referencia / tope) * 100}%` }}
              aria-hidden
            />
          ) : null}
          {datos.map((d, i) => {
            const atenuada = d.n !== undefined && d.n < 20;
            const altura = d.valor === null ? 0 : Math.max(0, Math.min(100, (d.valor / tope) * 100));
            return (
              <div key={i} className="flex h-full min-w-0 flex-1 items-end" title={d.titulo}>
                <div
                  className={`w-full rounded-t bg-acento ${atenuada ? 'opacity-35' : ''}`}
                  style={{ height: `${altura}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-[2px]">
          {datos.map((d, i) => (
            <div key={i} className="min-w-0 flex-1 text-center text-2xs tabular-nums text-apagado">
              {i % cadaCuantasEtiquetas === 0 ? d.etiqueta : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
