/* eslint-disable no-console -- this module is the single place that writes to the console. */

// Structured JSON logs (ADR-008). One line per event on stdout/stderr, which
// Vercel captures. Never pass answers, payloads, tokens or connection strings;
// redaction below is a safety net, not a licence.

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MAX_DEPTH = 6;
const REDACTED = "[redacted]";

const SENSITIVE_KEY = /(token|secret|password|passwd|authorization|cookie|apikey|api_key|connectionstring|connection_string|dsn|credential|privatekey|private_key)/i;

/** Keys ending in "id" (googleConnectionId, sessionId...) are identifiers, not secrets. */
export function isSensitiveKey(key: string): boolean {
  if (/id$/i.test(key)) return false;
  return SENSITIVE_KEY.test(key);
}

const SECRET_ENV_KEYS = [
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "AIESEC_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "CRON_SECRET",
  "GIS_SERVICE_TOKEN",
  "DATABASE_PASSWORD",
];

function secretValues(): string[] {
  const values = SECRET_ENV_KEYS.map((key) => process.env[key]).filter((value): value is string => Boolean(value && value.length >= 8));
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const url = process.env[key];
    const password = url?.match(/^[a-z]+:\/\/[^:/@]+:([^@]+)@/i)?.[1];
    if (password && password.length >= 6) values.push(password);
  }
  return values;
}

/** Masks credentials in free text: known secret values, bearer tokens and URL passwords. */
export function scrub(text: string): string {
  let result = text;
  for (const secret of secretValues()) {
    if (result.includes(secret)) result = result.split(secret).join(REDACTED);
  }
  result = result.replace(/(bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${REDACTED}`);
  result = result.replace(/([a-z][a-z0-9+.-]*:\/\/[^:/@\s]+:)[^@\s]+@/gi, `$1${REDACTED}@`);
  return result;
}

function serialize(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return scrub(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[circular]";
  seen.add(value);

  if (value instanceof Error) {
    const error: Record<string, unknown> = { name: value.name, message: scrub(value.message) };
    if (value.stack) error.stack = scrub(value.stack);
    const code = (value as { code?: unknown }).code;
    if (code !== undefined) error.code = serialize(code, depth + 1, seen);
    if (value.cause !== undefined) error.cause = serialize(value.cause, depth + 1, seen);
    return error;
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => serialize(item, depth + 1, seen));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : serialize(inner, depth + 1, seen);
  }
  return out;
}

function minimumLevel(): number {
  const configured = process.env.LOG_LEVEL as Level | undefined;
  if (configured && configured in LEVELS) return LEVELS[configured];
  return process.env.NODE_ENV === "production" ? LEVELS.info : LEVELS.debug;
}

function write(level: Level, msg: string, context?: Context): void {
  if (LEVELS[level] < minimumLevel()) return;
  const entry = {
    level,
    msg: scrub(msg),
    time: new Date().toISOString(),
    ...(context ? (serialize(context, 0, new WeakSet()) as Context) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, context?: Context) => write("debug", msg, context),
  info: (msg: string, context?: Context) => write("info", msg, context),
  warn: (msg: string, context?: Context) => write("warn", msg, context),
  error: (msg: string, context?: Context) => write("error", msg, context),
};

/** Exposed for tests. */
export const __test = { serialize: (value: unknown) => serialize(value, 0, new WeakSet()) };
