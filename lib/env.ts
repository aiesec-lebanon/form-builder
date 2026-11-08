import { z } from "zod";

// Validated configuration. Parsed lazily on first use so `next build` works
// without secrets, and cached afterwards. No "server-only" import: proxy.ts
// uses this module too. Nothing here is NEXT_PUBLIC_ except the base URL.

const base64Key32 = z.string().refine((value) => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}, "must be base64 of exactly 32 random bytes (openssl rand -base64 32)");

const commaList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: optionalText,
  AIESEC_AUTH_URL: z.url(),
  AIESEC_CLIENT_ID: z.string().min(1),
  AIESEC_CLIENT_SECRET: z.string().min(1),
  AIESEC_REDIRECT_URI: z.url(),
  GIS_GRAPHQL_URL: z.url(),
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),
  ENCRYPTION_KEY: base64Key32,
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_BASE_URL: z.url(),
  PLATFORM_ADMIN_PERSON_IDS: commaList,
  REQUIRE_CURRENT_POSITION: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  TURNSTILE_SITE_KEY: optionalText,
  TURNSTILE_SECRET_KEY: optionalText,
  DEV_LOGIN: optionalText,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${problems}`);
  }
  cached = parsed.data;
  return cached;
}

/** The canonical origin, without a trailing slash. */
export function baseUrl(): string {
  return env().NEXT_PUBLIC_BASE_URL.replace(/\/+$/, "");
}

export function googleConfigured(): boolean {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/** Dev login is impossible in production builds, whatever DEV_LOGIN says. */
export function devLoginEnabled(): boolean {
  return process.env.NODE_ENV === "development" && env().DEV_LOGIN === "1";
}

/** Test hook: forget the cached configuration. */
export function resetEnvCache(): void {
  cached = undefined;
}
