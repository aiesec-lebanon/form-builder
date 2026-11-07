import "server-only";

import { hmacBase64Url, safeEqual } from "@/lib/crypto";

// Minted when a form page renders; required to submit (spec §10). Bots must
// load the page first, and nobody can submit within MIN_AGE of loading it.

export const MIN_AGE_MS = 2000;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PURPOSE = "render-token-v1";

export function issueRenderToken(formId: string, now = Date.now()): string {
  const body = Buffer.from(`${formId}.${now}`).toString("base64url");
  return `${body}.${hmacBase64Url(PURPOSE, body)}`;
}

export type RenderTokenCheck = { ok: true } | { ok: false; reason: "invalid" | "too_fast" | "expired" };

export function verifyRenderToken(token: unknown, formId: string, now = Date.now()): RenderTokenCheck {
  if (typeof token !== "string" || token.length > 300) return { ok: false, reason: "invalid" };
  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(signature, hmacBase64Url(PURPOSE, body))) return { ok: false, reason: "invalid" };
  const [tokenFormId, issuedAtText] = Buffer.from(body, "base64url").toString("utf8").split(".");
  const issuedAt = Number(issuedAtText);
  if (tokenFormId !== formId || !Number.isFinite(issuedAt)) return { ok: false, reason: "invalid" };
  if (now - issuedAt < MIN_AGE_MS) return { ok: false, reason: "too_fast" };
  if (now - issuedAt > MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true };
}
