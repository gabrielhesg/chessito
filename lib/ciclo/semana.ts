/**
 * El ciclo de estudio de 8 semanas, derivado de una fecha y nada mas.
 *
 * **No hay pantalla de ajustes y no se va a construir una.** La app no tiene ninguna, y agregarla
 * por un solo campo no vale: cambiar la fecha de inicio es editar la constante de abajo, que es
 * una operacion de una vez cada dos meses. Un formulario para eso seria mas codigo que el ciclo
 * entero.
 *
 * El tema hace exactamente tres cosas: ordena la cola de ejercicios, da una linea en la portada,
 * y al cerrar la semana permite comparar los errores de ese tipo contra las cuatro anteriores.
 * **Sin racha, sin porcentaje de cumplimiento, sin notificaciones** — la regla del proyecto sigue
 * en pie, y un ciclo que puntua es un ciclo que se puede perder.
 */

/** Lunes en que arranca la semana 1. Cambiarlo es editar esta linea, a proposito. */
export const INICIO_DEL_CICLO = '2026-09-15';

export type Tema = {
  id: string;
  titulo: string;
  /**
   * Los `puzzles.theme` que cuentan como este tema. El mapeo NO es perfecto y no hace falta que
   * lo sea: sirve para ordenar una cola, no para clasificar el ajedrez. Un tema sin ninguno
   * (finales, estructuras) simplemente no reordena nada esa semana, que es honesto: la app no
   * tiene ejercicios de final.
   */
  themes: readonly string[];
};

export const TEMAS: readonly Tema[] = [
  { id: 'seguridad', titulo: 'Seguridad y amenazas', themes: ['pieza_colgada', 'permite_horquilla'] },
  { id: 'finales_rey_peon', titulo: 'Finales de rey y peón', themes: [] },
  { id: 'plan', titulo: 'Encontrar un plan', themes: [] },
  { id: 'estructuras', titulo: 'Estructuras de peones', themes: [] },
  { id: 'finales_torre', titulo: 'Finales de torre', themes: [] },
  { id: 'tactica', titulo: 'Táctica con nombre', themes: ['permite_horquilla', 'mate_pasillo'] },
  { id: 'repertorio', titulo: 'Repertorio', themes: [] },
  { id: 'auditoria', titulo: 'Auditoría de errores', themes: ['pieza_colgada', 'mate_pasillo', 'permite_horquilla'] },
];

export type SemanaDelCiclo = {
  /** 1 a 8. */
  numero: number;
  tema: Tema;
  /** Cuantas vueltas completas lleva el ciclo. 0 la primera. */
  vuelta: number;
  /** Dias transcurridos de la semana en curso, 0 el primer dia. */
  diaDeLaSemana: number;
};

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/**
 * En que semana del ciclo estamos. Antes del inicio devuelve `null`: una fecha futura no es la
 * semana 8 de la vuelta -1, es "el ciclo todavia no empieza".
 *
 * Las dos fechas se comparan en UTC a medianoche. La zona de referencia del proyecto es
 * `America/Santiago`, pero para contar semanas el desfase de horas no cambia nada y usar la zona
 * local aca obligaria a arrastrarla por toda la funcion para no cambiar ningun resultado.
 */
export function semanaDelCiclo(ahora: Date, inicio: string = INICIO_DEL_CICLO): SemanaDelCiclo | null {
  const desde = Date.parse(`${inicio}T00:00:00Z`);
  if (Number.isNaN(desde)) return null;
  const hoy = Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate());
  const dias = Math.floor((hoy - desde) / MS_POR_DIA);
  if (dias < 0) return null;

  const semanas = Math.floor(dias / 7);
  const numero = (semanas % TEMAS.length) + 1;
  const tema = TEMAS[numero - 1];
  if (!tema) return null;
  return {
    numero,
    tema,
    vuelta: Math.floor(semanas / TEMAS.length),
    diaDeLaSemana: dias % 7,
  };
}

/** Una fila de `v_errores_por_semana`, con lo mínimo que la comparación necesita. */
export type FilaSemana = {
  semana_inicio: string | null;
  n_partidas: number | null;
  theme: string | null;
  n_blunders: number | null;
};

export type CierreDeSemana = {
  /** Blunders del tema por partida, en la semana en curso. */
  estaSemana: number;
  /** El mismo número, promediado sobre las cuatro semanas anteriores con partidas. */
  anteriores: number | null;
  partidasEstaSemana: number;
  partidasAnteriores: number;
  /**
   * Si la comparación puede concluir algo. El umbral de 20 del proyecto aplica a los DOS lados:
   * una semana de 4 partidas contra otra de 11 no dice nada, por mucho que los números difieran.
   */
  concluye: boolean;
};

/**
 * El cierre de semana: los errores del tema en curso contra el promedio de las cuatro anteriores.
 *
 * Lo que hace honesto el numero es que se normaliza por partida y que se exige muestra en los dos
 * lados. Sin lo primero, una semana de 11 partidas "empeora" contra una de 4 solo por jugar mas;
 * sin lo segundo, se anuncia una mejora sobre tres partidas.
 *
 * Las semanas sin partidas no entran al promedio de "las cuatro anteriores": son semanas que no
 * ocurrieron, no semanas de cero errores.
 */
export function cierreDeSemana(
  filas: readonly FilaSemana[],
  temas: readonly string[],
  hoy: Date,
): CierreDeSemana | null {
  if (temas.length === 0) return null;

  const inicioDeSemana = (d: Date): string => {
    const dia = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    // ISO: lunes es 1. `getUTCDay` da 0 para domingo.
    const dow = new Date(dia).getUTCDay();
    const desdeLunes = (dow + 6) % 7;
    return new Date(dia - desdeLunes * 86_400_000).toISOString().slice(0, 10);
  };

  const semanaActual = inicioDeSemana(hoy);
  const porSemana = new Map<string, { partidas: number; blunders: number }>();
  for (const f of filas) {
    if (f.semana_inicio === null) continue;
    const clave = f.semana_inicio.slice(0, 10);
    const actual = porSemana.get(clave) ?? { partidas: f.n_partidas ?? 0, blunders: 0 };
    actual.partidas = f.n_partidas ?? actual.partidas;
    if (f.theme !== null && temas.includes(f.theme)) actual.blunders += f.n_blunders ?? 0;
    porSemana.set(clave, actual);
  }

  const deEstaSemana = porSemana.get(semanaActual);
  if (!deEstaSemana || deEstaSemana.partidas === 0) return null;

  const anteriores = [...porSemana.entries()]
    .filter(([k, v]) => k < semanaActual && v.partidas > 0)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 4)
    .map(([, v]) => v);

  const partidasAnteriores = anteriores.reduce((a, v) => a + v.partidas, 0);
  const blundersAnteriores = anteriores.reduce((a, v) => a + v.blunders, 0);

  return {
    estaSemana: deEstaSemana.blunders / deEstaSemana.partidas,
    anteriores: partidasAnteriores > 0 ? blundersAnteriores / partidasAnteriores : null,
    partidasEstaSemana: deEstaSemana.partidas,
    partidasAnteriores,
    concluye: deEstaSemana.partidas >= 20 && partidasAnteriores >= 20,
  };
}

export type LoQueFalta = {
  /** Partidas que faltan esta semana para llegar al umbral. 0 si ya está. */
  faltanEstaSemana: number;
  /** Partidas que le faltan al grupo de comparación (las cuatro semanas anteriores). 0 si ya está. */
  faltanAnteriores: number;
};

/**
 * Qué falta, en partidas, para que el cierre de semana deje de ser ruido.
 *
 * Existe para que la portada pueda decir algo **verdadero y alcanzable** sobre lo que gana una
 * partida más, en vez de un contador que solo sube. No inventa nada: si la comparación ya
 * concluye, devuelve null y la portada no dice nada.
 *
 * El umbral es alcanzable y está medido: la mediana de sus semanas con rápida son 23 partidas, y
 * 39 de 69 semanas pasaron de 20. No lo es a su volumen de los últimos seis meses (2 de 13), que
 * es justamente lo que el numero deberia empujar a cambiar.
 *
 * Los dos lados van por separado a proposito: llegar a 20 esta semana es **necesario pero no
 * suficiente** si el grupo de comparacion todavia no junta 20, y prometer que una partida
 * destraba algo que no destraba es peor que no decir nada.
 */
export function loQueFaltaParaConcluir(cierre: CierreDeSemana | null, umbral = 20): LoQueFalta | null {
  if (cierre === null || cierre.concluye) return null;
  return {
    faltanEstaSemana: Math.max(0, umbral - cierre.partidasEstaSemana),
    faltanAnteriores: Math.max(0, umbral - cierre.partidasAnteriores),
  };
}
