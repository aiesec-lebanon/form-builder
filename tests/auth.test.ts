import { afterEach, describe, expect, it, vi } from "vitest";

import { exchangeCode, OAuthError, refreshTokens, safeReturnTo } from "@/lib/auth/oauth";
import { evaluateAccess, isPlatformAdmin } from "@/lib/auth/policy";
import {
  needsRefresh,
  newSessionPayload,
  sealSession,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_ROLLING_SECONDS,
  unsealSession,
  withRefreshedTokens,
} from "@/lib/auth/session";

const USER_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";
const NOW = 1_800_000_000;

function payload(overrides: Partial<Parameters<typeof newSessionPayload>[0]> = {}) {
  return newSessionPayload({
    userId: USER_ID,
    personId: "123456",
    tokens: { accessToken: "at-1", refreshToken: "rt-1", expiresAt: NOW + 7200 },
    now: NOW,
    ...overrides,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("session sealing", () => {
  it("round-trips and hides the tokens", async () => {
    const sealed = await sealSession(payload());
    expect(sealed).not.toContain("at-1");
    expect(sealed).not.toContain("rt-1");
    expect(await unsealSession(sealed, NOW + 10)).toMatchObject({ uid: USER_ID, pid: "123456", at: "at-1", rt: "rt-1" });
  });

  it("rejects tampering, garbage and oversized cookies", async () => {
    const sealed = await sealSession(payload());
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(await unsealSession(parts.join("."), NOW)).toBeNull();
    expect(await unsealSession("not-a-jwe", NOW)).toBeNull();
    expect(await unsealSession("x".repeat(5000), NOW)).toBeNull();
    expect(await unsealSession(undefined, NOW)).toBeNull();
  });

  it("expires after the rolling lifetime", async () => {
    const sealed = await sealSession(payload());
    expect(await unsealSession(sealed, NOW + SESSION_ROLLING_SECONDS - 1)).not.toBeNull();
    expect(await unsealSession(sealed, NOW + SESSION_ROLLING_SECONDS)).toBeNull();
  });

  it("refresh renews the rolling window but never past the absolute cap", () => {
    const start = payload();
    const later = NOW + SESSION_ABSOLUTE_SECONDS - 3600;
    const refreshed = withRefreshedTokens(start, { accessToken: "at-2", refreshToken: null, expiresAt: later + 7200 }, later);
    expect(refreshed.at).toBe("at-2");
    expect(refreshed.rt).toBe("rt-1"); // kept when the provider does not rotate it
    expect(refreshed.exp).toBe(start.aat + SESSION_ABSOLUTE_SECONDS);
  });

  it("needs a refresh only near access-token expiry and only with a refresh token", () => {
    const p = payload();
    expect(needsRefresh(p, NOW)).toBe(false);
    expect(needsRefresh(p, NOW + 7200 - 60)).toBe(true);
    expect(needsRefresh({ ...p, rt: null }, NOW + 7200)).toBe(false);
  });
});

describe("safeReturnTo", () => {
  it("allows same-site paths", () => {
    expect(safeReturnTo("/forms/abc/edit?tab=connect")).toBe("/forms/abc/edit?tab=connect");
  });

  it.each([
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "/api/auth/callback",
    "/login",
    "/forms\n/evil",
    `/${"a".repeat(600)}`,
  ])("falls back for %s", (value) => {
    expect(safeReturnTo(value)).toBe("/forms");
  });
});

describe("token endpoint", () => {
  it("parses tokens and computes expiry from created_at + expires_in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 7200, created_at: NOW }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(exchangeCode("code-1")).resolves.toEqual({ accessToken: "a", refreshToken: "r", expiresAt: NOW + 7200 });
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("client_secret")).toBe("test-client-secret");
  });

  it("classifies a rejected refresh as invalid and outages as unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(refreshTokens("r")).rejects.toMatchObject({ kind: "invalid" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(refreshTokens("r")).rejects.toMatchObject({ kind: "unavailable" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    await expect(refreshTokens("r")).rejects.toBeInstanceOf(OAuthError);
  });
});

describe("access policy", () => {
  const options = { requireCurrentPosition: true, adminIds: ["42"] };

  it("requires a current position", () => {
    expect(evaluateAccess({ personId: "7", activePositionCount: 1 }, options)).toEqual({ allowed: true });
    expect(evaluateAccess({ personId: "7", activePositionCount: 0 }, options)).toEqual({ allowed: false, reason: "no_position" });
  });

  it("always lets platform admins in", () => {
    expect(evaluateAccess({ personId: "42", activePositionCount: 0 }, options)).toEqual({ allowed: true });
    expect(isPlatformAdmin("42", ["42"])).toBe(true);
    expect(isPlatformAdmin(BigInt(43), ["42"])).toBe(false);
  });

  it("can be relaxed by configuration", () => {
    expect(evaluateAccess({ personId: "7", activePositionCount: 0 }, { ...options, requireCurrentPosition: false })).toEqual({ allowed: true });
  });
});
