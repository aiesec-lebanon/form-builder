import { CompactEncrypt, compactDecrypt } from "jose";
import { z } from "zod";

import { derivedKey } from "@/lib/crypto";

// The session cookie (ADR-002): one JWE (dir + A256GCM) holding our user id and
// the user's own AIESEC access/refresh tokens. Unreadable and unforgeable by
// the browser. Imported by proxy.ts, so: no database, no next/headers.

export const SESSION_COOKIE = "fb_session";
/** Rolling lifetime, renewed on every token refresh. */
export const SESSION_ROLLING_SECONDS = 30 * 24 * 60 * 60;
/** Hard cap from the original sign-in. */
export const SESSION_ABSOLUTE_SECONDS = 90 * 24 * 60 * 60;
/** Refresh the AIESEC access token when it expires within this window. */
export const REFRESH_WINDOW_SECONDS = 5 * 60;

const payloadSchema = z.object({
  v: z.literal(1),
  /** users.id */
  uid: z.string().uuid(),
  /** EXPA person id */
  pid: z.string().regex(/^\d+$/),
  /** AIESEC access token */
  at: z.string().min(1),
  /** AIESEC refresh token (null only for local dev sessions) */
  rt: z.string().min(1).nullable(),
  /** access token expiry, epoch seconds */
  ate: z.number().int(),
  /** issued at, epoch seconds */
  iat: z.number().int(),
  /** session expiry, epoch seconds */
  exp: z.number().int(),
  /** original sign-in time, epoch seconds */
  aat: z.number().int(),
});

export type SessionPayload = z.infer<typeof payloadSchema>;

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  /** epoch seconds */
  expiresAt: number;
};

export const nowSeconds = () => Math.floor(Date.now() / 1000);

function key(): Uint8Array {
  return new Uint8Array(derivedKey("session-v1"));
}

export function newSessionPayload(input: { userId: string; personId: string; tokens: TokenSet; now?: number }): SessionPayload {
  const now = input.now ?? nowSeconds();
  return {
    v: 1,
    uid: input.userId,
    pid: input.personId,
    at: input.tokens.accessToken,
    rt: input.tokens.refreshToken,
    ate: input.tokens.expiresAt,
    iat: now,
    exp: Math.min(now + SESSION_ROLLING_SECONDS, now + SESSION_ABSOLUTE_SECONDS),
    aat: now,
  };
}

/** The same session with new tokens; the rolling lifetime restarts, the absolute cap does not. */
export function withRefreshedTokens(payload: SessionPayload, tokens: TokenSet, now = nowSeconds()): SessionPayload {
  return {
    ...payload,
    at: tokens.accessToken,
    rt: tokens.refreshToken ?? payload.rt,
    ate: tokens.expiresAt,
    iat: now,
    exp: Math.min(now + SESSION_ROLLING_SECONDS, payload.aat + SESSION_ABSOLUTE_SECONDS),
  };
}

export function needsRefresh(payload: SessionPayload, now = nowSeconds()): boolean {
  return payload.rt !== null && payload.ate - now < REFRESH_WINDOW_SECONDS;
}

export async function sealSession(payload: SessionPayload): Promise<string> {
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(key());
}

/** Null for anything missing, malformed, tampered or expired. */
export async function unsealSession(token: string | undefined | null, now = nowSeconds()): Promise<SessionPayload | null> {
  if (!token || token.length > 4096) return null;
  try {
    const { plaintext } = await compactDecrypt(token, key(), {
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: ["A256GCM"],
    });
    const parsed = payloadSchema.safeParse(JSON.parse(new TextDecoder().decode(plaintext)));
    if (!parsed.success) return null;
    const payload = parsed.data;
    if (payload.exp <= now) return null;
    if (payload.aat + SESSION_ABSOLUTE_SECONDS <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(payload: SessionPayload, now = nowSeconds()) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not Strict: the OAuth callback is a cross-site navigation.
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(0, payload.exp - now),
  };
}
