/**
 * Logging con nivel y salida JSON en CI, para que los logs de GitHub Actions se puedan leer.
 * docs/ENGINEERING.md seccion 8.
 *
 * Excepcion consciente a la regla de `lib/env.ts`: este archivo lee `CI` y `LOG_FORMAT` de
 * `process.env` directamente. Son variables de PRESENTACION, no de configuracion: no pueden
 * faltar (si no estan, se imprime en formato humano) y meterlas en el esquema Zod obligaria a
 * importar `lib/env.ts` desde el logger, que es justo lo que se usa para reportar que a
 * `lib/env.ts` le falta algo.
 */
export type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const asJson = process.env['CI'] === 'true' || process.env['LOG_FORMAT'] === 'json';
  if (asJson) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  const extra = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
  const line = `[${level}] ${message}${extra}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
};
