import { afterEach, describe, expect, it, vi } from "vitest";

const config: { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string } = {};
vi.mock("@/lib/env", () => ({ env: () => config }));

const { turnstileSiteKey, verifyTurnstile } = await import("@/lib/turnstile");

const input = { token: "token-1", ip: "203.0.113.7", idempotencyKey: "0b7d3f8e-2c1a-4f5e-9d6b-1a2b3c4d5e6f" };

function siteverify(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete config.TURNSTILE_SITE_KEY;
  delete config.TURNSTILE_SECRET_KEY;
});

const enable = () => {
  config.TURNSTILE_SITE_KEY = "site-key";
  config.TURNSTILE_SECRET_KEY = "secret-key";
};

describe("Turnstile check", () => {
  it("is off until both keys are set", async () => {
    config.TURNSTILE_SITE_KEY = "site-key";
    expect(turnstileSiteKey()).toBeNull();
    const fetchMock = siteverify({ success: false });
    expect(await verifyTurnstile({ ...input, token: undefined })).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a valid token and sends the secret, IP and idempotency key", async () => {
    enable();
    expect(turnstileSiteKey()).toBe("site-key");
    const fetchMock = siteverify({ success: true, action: "submit" });
    expect(await verifyTurnstile(input)).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(sent)).toEqual({ secret: "secret-key", response: "token-1", idempotency_key: input.idempotencyKey, remoteip: "203.0.113.7" });
  });

  it("rejects missing, invalid and wrong-action tokens", async () => {
    enable();
    expect(await verifyTurnstile({ ...input, token: undefined })).toEqual({ ok: false, reason: "missing" });
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstile(input)).toEqual({ ok: false, reason: "rejected" });
    siteverify({ success: true, action: "login" });
    expect(await verifyTurnstile(input)).toEqual({ ok: false, reason: "rejected" });
  });

  it("lets responses through when Cloudflare can't be reached", async () => {
    enable();
    siteverify({ error: "unavailable" }, 503);
    expect(await verifyTurnstile(input)).toEqual({ ok: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await verifyTurnstile(input)).toEqual({ ok: true });
  });
});
