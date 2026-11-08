import "server-only";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// Cloudflare Turnstile check for form submissions (ADR-012). Off unless both
// keys are configured. Rejections block the response; an unreachable
// Cloudflare doesn't (the other spam defences still apply).

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const TURNSTILE_ACTION = "submit";

export type TurnstileCheck = { ok: true } | { ok: false; reason: "missing" | "rejected" };

type SiteverifyResponse = { success?: boolean; action?: string; "error-codes"?: string[] };

export function turnstileEnabled(): boolean {
  const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY } = env();
  return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
}

/** The public site key for the widget, or null when Turnstile is off. */
export function turnstileSiteKey(): string | null {
  return turnstileEnabled() ? (env().TURNSTILE_SITE_KEY ?? null) : null;
}

export async function verifyTurnstile(input: { token: string | undefined; ip: string | null; idempotencyKey: string }): Promise<TurnstileCheck> {
  if (!turnstileEnabled()) return { ok: true };
  if (!input.token) return { ok: false, reason: "missing" };
  const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY as string, response: input.token, idempotency_key: input.idempotencyKey });
  if (input.ip) body.set("remoteip", input.ip);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      logger.warn("turnstile.unavailable", { status: response.status });
      return { ok: true };
    }
    const result = (await response.json()) as SiteverifyResponse;
    if (result.success === true && (result.action === undefined || result.action === TURNSTILE_ACTION)) return { ok: true };
    logger.info("turnstile.rejected", { codes: (result["error-codes"] ?? []).join(","), action: result.action ?? null });
    return { ok: false, reason: "rejected" };
  } catch (error) {
    logger.warn("turnstile.unavailable", { error });
    return { ok: true };
  }
}
