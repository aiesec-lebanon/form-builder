import "server-only";

import { z } from "zod";

import { baseUrl, env } from "@/lib/env";

// "Connect Google" (spec §13): OAuth 2.0 web flow, offline access, and only the
// non-sensitive drive.file scope (files this app creates or the user opens with it).

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];
export const GOOGLE_STATE_COOKIE = "fb_google_state";
export const GOOGLE_RETURN_COOKIE = "fb_google_return_to";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export function googleRedirectUri(): string {
  return `${baseUrl()}/api/google/callback`;
}

export function googleCookieOptions(maxAge = 600) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/google", maxAge };
}

/**
 * Google's consent URL. `hostedDomain` asks Google to offer only accounts of
 * that Workspace domain ("*" = any Workspace account); it's a hint, the
 * callback still checks the account's domain.
 */
export function googleAuthorizeUrl(state: string, hints: { loginHint?: string | null; hostedDomain?: string | null } = {}): string {
  const params = new URLSearchParams({
    client_id: env().GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (hints.loginHint) params.set("login_hint", hints.loginHint);
  if (hints.hostedDomain) params.set("hd", hints.hostedDomain);
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export class GoogleAuthError extends Error {
  constructor(
    readonly kind: "revoked" | "unavailable" | "invalid",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GoogleAuthError";
  }
}

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive().default(3600),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().default(""),
  id_token: z.string().optional(),
});

async function tokenRequest(params: Record<string, string>) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = env();
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new GoogleAuthError("invalid", "Google isn't configured on this server");
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...params, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new GoogleAuthError("unavailable", "Google's token endpoint is unreachable", { cause: error });
  }
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) {
    if (body?.error === "invalid_grant") throw new GoogleAuthError("revoked", "Google access was revoked or expired");
    throw new GoogleAuthError(response.status >= 500 ? "unavailable" : "invalid", `Google token endpoint responded ${response.status}`);
  }
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) throw new GoogleAuthError("unavailable", "Unexpected token response from Google");
  return parsed.data;
}

/** Identity claims from an id_token received directly from Google over TLS (OIDC §3.1.3.7 allows skipping signature checks here). */
function claimsOf(idToken: string | undefined): { sub: string; email: string; emailVerified: boolean; hostedDomain: string | null } | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { sub?: string; email?: string; email_verified?: boolean; hd?: string };
    if (!payload.sub || !payload.email) return null;
    // hd is set by Google only for Google Workspace accounts, e.g. "aiesec.net".
    return { sub: payload.sub, email: payload.email.toLowerCase(), emailVerified: payload.email_verified !== false, hostedDomain: payload.hd?.toLowerCase() ?? null };
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode(code: string) {
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: googleRedirectUri() });
  const claims = claimsOf(tokens.id_token);
  if (!claims) throw new GoogleAuthError("invalid", "Google didn't return the account identity");
  if (!tokens.refresh_token) throw new GoogleAuthError("invalid", "Google didn't return a refresh token");
  if (!tokens.scope.includes("drive.file")) throw new GoogleAuthError("invalid", "Drive access wasn't granted");
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scopes: tokens.scope,
    ...claims,
  };
}

/** Withdraws a grant at Google (best effort, never throws). */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Revocation is best effort.
  }
}

export async function refreshGoogleToken(refreshToken: string) {
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
  return { accessToken: tokens.access_token, expiresAt: new Date(Date.now() + tokens.expires_in * 1000) };
}
