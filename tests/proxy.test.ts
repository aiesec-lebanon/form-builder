import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { newSessionPayload, nowSeconds, sealSession, SESSION_COOKIE, unsealSession } from "@/lib/auth/session";
import { proxy } from "@/proxy";

const USER_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";

async function cookieFor(expiresInSeconds: number, refreshToken: string | null = "rt-1") {
  const now = nowSeconds();
  return sealSession(
    newSessionPayload({ userId: USER_ID, personId: "123", tokens: { accessToken: "at-1", refreshToken, expiresAt: now + expiresInSeconds }, now }),
  );
}

function request(path: string, init: { cookie?: string; headers?: Record<string, string>; method?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", `${SESSION_COOKIE}=${init.cookie}`);
  return new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? "GET", headers });
}

const documentHeaders = { "sec-fetch-dest": "document", accept: "text/html" };

afterEach(() => vi.unstubAllGlobals());

describe("proxy gate", () => {
  it("sends signed-out page requests to sign in with a return path", async () => {
    const response = await proxy(request("/forms/abc/edit?tab=connect"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnTo")).toBe("/forms/abc/edit?tab=connect");
  });

  it("answers signed-out API calls with 401 JSON", async () => {
    const response = await proxy(request("/api/google/connect"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "unauthorized" });
  });

  it("lets public routes through with security headers", async () => {
    const response = await proxy(request("/f/abc123"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("allows only the embed route to be framed", async () => {
    const response = await proxy(request("/embed/abc123"));
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect(response.headers.get("x-frame-options")).toBeNull();
  });

  it("passes valid sessions without touching the token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await proxy(request("/forms", { cookie: await cookieFor(3600), headers: documentHeaders }));
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("inline refresh", () => {
  it("refreshes near expiry on a page load and reseals the cookie", async () => {
    const now = nowSeconds();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "at-2", refresh_token: "rt-2", expires_in: 7200, created_at: now }), { status: 200 })),
    );
    const response = await proxy(request("/forms", { cookie: await cookieFor(60), headers: documentHeaders }));
    expect(response.status).toBe(200);
    const sealed = response.cookies.get(SESSION_COOKIE)?.value;
    const renewed = await unsealSession(sealed);
    expect(renewed).toMatchObject({ at: "at-2", rt: "rt-2", uid: USER_ID });
  });

  it("does not refresh on background (RSC) requests", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await proxy(request("/forms", { cookie: await cookieFor(60), headers: { rsc: "1" } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ends the session when AIESEC rejects the refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    const response = await proxy(request("/forms", { cookie: await cookieFor(60), headers: documentHeaders }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=session_expired");
  });

  it("keeps the user in when AIESEC is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network down")));
    const response = await proxy(request("/forms", { cookie: await cookieFor(60), headers: documentHeaders }));
    expect(response.status).toBe(200);
  });
});
