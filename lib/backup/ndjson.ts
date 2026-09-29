/**
 * Las dos decisiones del respaldo, puras y testeables: cómo se parte y qué se rota.
 *
 * Viven aparte del script porque las dos se equivocaron en silencio una vez. El respaldo subía
 * `moves` entero en un solo archivo, y cuando el backfill de rápida lo hizo crecer pasó el máximo
 * por objeto de Supabase Storage: el cron de análisis falló seis días seguidos (24 al 29 de
 * septiembre) con `The object exceeded the maximum allowed size`. El análisis y los ejercicios de
 * esos días sí terminaron — lo que no se hizo fue el respaldo, que es justamente lo irrecuperable.
 */

/** Filas por archivo. Con gzip, cada parte queda muy por debajo del tope de 50 MB. */
export const FILAS_POR_PARTE = 100_000;

/** Días de respaldo que se conservan. Lo demás se borra, para no llenar el GB gratuito. */
export const DIAS_A_CONSERVAR = 14;

/**
 * Parte una lista de líneas NDJSON en trozos de a lo sumo `filasPorParte`. Siempre devuelve al
 * menos una parte, aunque esté vacía: un respaldo de cero filas tiene que existir igual, porque la
 * ausencia de archivo no distingue "no había nada" de "falló".
 */
export function partir(lineas: readonly string[], filasPorParte: number = FILAS_POR_PARTE): string[][] {
  if (filasPorParte < 1) throw new Error('filasPorParte tiene que ser al menos 1');
  if (lineas.length === 0) return [[]];
  const partes: string[][] = [];
  for (let i = 0; i < lineas.length; i += filasPorParte) partes.push(lineas.slice(i, i + filasPorParte));
  return partes;
}

/**
 * Qué fechas de respaldo borrar: todas menos las `conservar` más recientes.
 *
 * Solo recibe fechas del formato nuevo (`YYYY-MM-DD`), así que los archivos viejos de un solo
 * bloque (`moves-YYYY-MM-DD.ndjson`) nunca entran acá: no los creó esta versión y no se tocan.
 * Una fecha que no calce con el formato tampoco se borra — ante la duda, un respaldo se conserva.
 */
export function fechasARotar(fechas: readonly string[], conservar: number = DIAS_A_CONSERVAR): string[] {
  const validas = [...new Set(fechas.filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)))].sort();
  if (conservar < 1) return [];
  return validas.slice(0, Math.max(0, validas.length - conservar));
}
