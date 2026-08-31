/**
 * Logging con nivel y salida JSON en CI, para que los logs de GitHub Actions se puedan leer.
 * docs/ENGINEERING.md seccion 8.
 */
export type LogLevel = 'info' | 'warn' | 'error';

function emit(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
  const asJson = process.env['CI'] === 'true' || process.env['LOG_FORMAT'] === 'json';
  if (asJson) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, message, ...fields });
    if (level === 'error') console.error(line);
    else console.warn(line);
    return;
  }
  const extra = fields && Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
  const line = `[${level}] ${message}${extra}`;
  if (level === 'error') console.error(line);
  else console.warn(line);
}

export const log = {
  info: (message: string, fields?: Record<string, unknown>) => emit('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => emit('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => emit('error', message, fields),
};
