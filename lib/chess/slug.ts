/**
 * La UNICA funcion de slug del proyecto.
 *
 * `openings.id` se construye como `eco + '_' + slug(name)` y `games.opening_id` lo referencia
 * por clave foranea. Si esta regla cambia, todos los FK quedan colgando (0001_init.sql lo dice
 * explicitamente), asi que vive aca sola, exportada y testeada.
 */

/** Normaliza un nombre de apertura a un slug estable: minusculas, sin tildes, con guiones. */
export function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Identificador determinista de una apertura, p.ej. `C44_ponziani-opening`. */
export function openingId(eco: string, name: string): string {
  return `${eco.trim().toUpperCase()}_${slug(name)}`;
}
