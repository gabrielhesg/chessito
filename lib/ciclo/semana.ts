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
