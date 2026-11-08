import { CompactEncrypt, compactDecrypt } from "jose";
import { z } from "zod";

import { derivedKey } from "@/lib/crypto";

// Who is answering an AIESEC-only form (ADR-013). A sealed cookie holding the
// identity read from AIESEC at sign-in: no users row, no stored AIESEC token,
// nothing in our database. Lasts 12 hours.

export const RESPONDENT_COOKIE = "fb_respondent";
export const RESPONDENT_TTL_SECONDS = 12 * 60 * 60;
/** Set by /api/auth/login?purpose=respond so the callback knows not to open an app session. */
export const PURPOSE_COOKIE = "fb_oauth_purpose";

export type Respondent = {
  /** EXPA person id */
  aiesecId: string;
  name: string;
  email: string | null;
  /** Has a current EXPA position. */
  member: boolean;
};

const payloadSchema = z.object({
  v: z.literal(1),
  pid: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(200),
  email: z.string().max(320).nullable(),
  member: z.boolean(),
  iat: z.number().int(),
  exp: z.number().int(),
});

const nowSeconds = () => Math.floor(Date.now() / 1000);

function key(): Uint8Array {
  return new Uint8Array(derivedKey("respondent-v1"));
}

export async function sealRespondent(respondent: Respondent, now = nowSeconds()): Promise<string> {
  const payload = { v: 1, pid: respondent.aiesecId, name: respondent.name.slice(0, 200), email: respondent.email, member: respondent.member, iat: now, exp: now + RESPONDENT_TTL_SECONDS };
  return new CompactEncrypt(new TextEncoder().encode(JSON.stringify(payload))).setProtectedHeader({ alg: "dir", enc: "A256GCM" }).encrypt(key());
}

/** Null for anything missing, malformed, tampered or expired. */
export async function unsealRespondent(token: string | undefined | null, now = nowSeconds()): Promise<Respondent | null> {
  if (!token || token.length > 2048) return null;
  try {
    const { plaintext } = await compactDecrypt(token, key(), { keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"] });
    const parsed = payloadSchema.safeParse(JSON.parse(new TextDecoder().decode(plaintext)));
    if (!parsed.success || parsed.data.exp <= now) return null;
    return { aiesecId: parsed.data.pid, name: parsed.data.name, email: parsed.data.email, member: parsed.data.member };
  } catch {
    return null;
  }
}

export function respondentCookieOptions(maxAge = RESPONDENT_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax: the AIESEC callback is a cross-site navigation.
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Respondent sign-in may only return to a form page. */
export function isFormPath(path: string): boolean {
  return /^\/f\/[a-z0-9-]{1,80}(?:\?[^#\s]*)?$/.test(path);
}
