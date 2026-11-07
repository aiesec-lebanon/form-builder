import { z } from "zod";

import { env } from "@/lib/env";

import type { TokenSet } from "./session";

// AIESEC OAuth, Authorization Code flow as in auth-template: the user's own
// access + refresh tokens, exchanged and refreshed with the app's client
// credentials. `state` (absent from the template) blocks login CSRF.
// Imported by proxy.ts: no database, no next/headers.

export const STATE_COOKIE = "fb_oauth_state";
export const RETURN_TO_COOKIE = "fb_oauth_return_to";
const HANDSHAKE_TTL_SECONDS = 10 * 60;
const TOKEN_TIMEOUT_MS = 10_000;
/** AIESEC access tokens last 2 hours; used if the response omits expires_in. */
const DEFAULT_EXPIRES_IN = 2 * 60 * 60;

export const DEFAULT_RETURN_TO = "/forms";

export function handshakeCookieOptions(maxAge = HANDSHAKE_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    // Only the auth endpoints ever need these.
    path: "/api/auth",
    maxAge,
  };
}

/** Only same-site relative paths; blocks open redirects (//evil, /\evil, schemes). */
export function safeReturnTo(candidate: string | null | undefined): string {
  if (!candidate || candidate.length > 512) return DEFAULT_RETURN_TO;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) return DEFAULT_RETURN_TO;
  // Control characters and whitespace have no place in a path we redirect to.
  for (let index = 0; index < candidate.length; index += 1) {
    const code = candidate.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) return DEFAULT_RETURN_TO;
  }
  if (candidate.startsWith("/api/") || candidate === "/login" || candidate.startsWith("/login?")) return DEFAULT_RETURN_TO;
  return candidate;
}

function authBase(): string {
  return env().AIESEC_AUTH_URL.replace(/\/+$/, "");
}

export function authorizeUrl(state: string): string {
  const { AIESEC_CLIENT_ID, AIESEC_REDIRECT_URI } = env();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: AIESEC_CLIENT_ID,
    redirect_uri: AIESEC_REDIRECT_URI,
    state,
  });
  return `${authBase()}/authorize?${params.toString()}`;
}

/** `invalid`: AIESEC rejected the grant (sign in again). `unavailable`: try later. */
export class OAuthError extends Error {
  constructor(
    readonly kind: "invalid" | "unavailable",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "OAuthError";
  }
}

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  created_at: z.number().int().positive().optional(),
});

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { AIESEC_CLIENT_ID, AIESEC_CLIENT_SECRET } = env();
  let response: Response;
  try {
    response = await fetch(`${authBase()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...params, client_id: AIESEC_CLIENT_ID, client_secret: AIESEC_CLIENT_SECRET }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    throw new OAuthError("unavailable", "AIESEC token endpoint unreachable", { cause: error });
  }

  if (response.status >= 500 || response.status === 429) {
    throw new OAuthError("unavailable", `AIESEC token endpoint responded ${response.status}`);
  }
  if (!response.ok) {
    throw new OAuthError("invalid", `AIESEC token endpoint responded ${response.status}`);
  }

  const parsed = tokenResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new OAuthError("unavailable", "AIESEC token endpoint returned an unexpected body");

  const body = parsed.data;
  const issuedAt = body.created_at ?? Math.floor(Date.now() / 1000);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    expiresAt: issuedAt + (body.expires_in ?? DEFAULT_EXPIRES_IN),
  };
}

export function exchangeCode(code: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: env().AIESEC_REDIRECT_URI });
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}
