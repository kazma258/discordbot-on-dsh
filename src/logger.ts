export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogContext = Record<string, unknown>;
export type LogSink = (line: string, level: LogLevel) => void;

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

/**
 * Context keys whose values must never reach a log line. This is a second
 * line of defence: callers should still avoid putting credentials in context.
 */
const SENSITIVE_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie)/i;
const REDACTED = '[REDACTED]';

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly sink?: LogSink;
  readonly now?: () => Date;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && Object.hasOwn(LEVEL_RANK, value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol') return value.toString();
  if (typeof value === 'function') return '[Function]';
  if (typeof value !== 'object') return value;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (ancestors.has(value)) return '[Circular]';

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      try {
        return value.map((item) => sanitizeValue(item, ancestors));
      } catch {
        return '[Unserializable]';
      }
    }
    if (isPlainObject(value)) {
      // A null prototype prevents __proto__/constructor from changing the
      // sanitized object's behaviour.
      const result: Record<string, unknown> = Object.create(null);
      let keys: string[];
      try {
        keys = Object.keys(value);
      } catch {
        return '[Unserializable]';
      }
      for (const key of keys.sort()) {
        try {
          result[key] = SENSITIVE_KEY.test(key)
            ? REDACTED
            : sanitizeValue(value[key], ancestors);
        } catch {
          result[key] = '[Unserializable]';
        }
      }
      return result;
    }
    try {
      return String(value);
    } catch {
      return '[Unserializable]';
    }
  } finally {
    ancestors.delete(value);
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol' ||
    typeof value === 'function'
  ) {
    return String(value);
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return '[Unserializable]';
  }
}

function redactMessage(message: string): string {
  return message.replace(
    /\b(token|secret|password|passwd|api[_-]?key|authorization|cookie)\b\s*[=:]\s*([^\s,;]+)/gi,
    `$1=${REDACTED}`
  );
}

function formatContext(context: LogContext): string {
  return Object.keys(context)
    .sort()
    .map((key) => {
      if (SENSITIVE_KEY.test(key)) return `${key}=${REDACTED}`;
      return `${key}=${formatValue(sanitizeValue(context[key], new WeakSet()))}`;
    })
    .join(' ');
}

function formatMessage(message: string): string {
  // Keep logs single-line; JSON-quote a message that contains control chars.
  const safe = redactMessage(message);
  return /[\u0000-\u001f\u007f]/.test(safe) ? JSON.stringify(safe) : safe;
}

const defaultSink: LogSink = (line, level) => {
  const stream = level === 'error' ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
};

function createLoggerInternal(
  threshold: LogLevel,
  sink: LogSink,
  now: () => Date,
  bindings: LogContext
): Logger {
  const write = (level: LogLevel, message: string, context?: LogContext): void => {
    if (LEVEL_RANK[level] < LEVEL_RANK[threshold]) return;

    const merged: LogContext = { ...bindings, ...context };
    const timestamp = now().toISOString();
    const contextText = formatContext(merged);
    const line = `${timestamp} ${level.toUpperCase()} ${formatMessage(message)}${
      contextText.length > 0 ? ` ${contextText}` : ''
    }`;
    sink(line, level);
  };

  return {
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    child: (childBindings) =>
      createLoggerInternal(threshold, sink, now, { ...bindings, ...childBindings })
  };
}

export function createLogger(options: LoggerOptions = {}): Logger {
  return createLoggerInternal(
    options.level ?? 'info',
    options.sink ?? defaultSink,
    options.now ?? (() => new Date()),
    {}
  );
}
