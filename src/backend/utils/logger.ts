/**
 * Secure Server Logger with Sensitive Data Redaction
 * Ensures tokens, passwords, keys, and authorization headers are never logged.
 */

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'session',
  'key',
]);

function redactSensitive(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(redactSensitive);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitive(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export const serverLogger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${message}`, meta ? redactSensitive(meta) : '');
    }
  },
  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(`[WARN] ${message}`, meta ? redactSensitive(meta) : '');
  },
  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    console.error(`[ERROR] ${message}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(meta ? (redactSensitive(meta) as Record<string, unknown>) : {}),
    });
  },
};
