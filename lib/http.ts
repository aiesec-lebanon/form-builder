import { NextResponse } from "next/server";

/** Stable error codes returned by route handlers. */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "closed"
  | "invalid"
  | "too_large"
  | "rate_limited"
  | "delivery_failed"
  | "upload_failed"
  | "server_error";

export function jsonError(status: number, code: ErrorCode, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error: code, message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function jsonOk<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, ...data }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Rejects cross-site state-changing requests (defence in depth beyond SameSite cookies). */
export function isSameOrigin(request: Request, expectedOrigin: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  return origin === expectedOrigin;
}

/** Reads a JSON body with a byte cap. Returns null if missing, too big or malformed. */
export async function readJson(request: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; reason: "too_large" | "invalid" }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, reason: "too_large" };
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) return { ok: false, reason: "too_large" };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
