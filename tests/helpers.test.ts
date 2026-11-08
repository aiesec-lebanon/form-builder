import { afterEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/lib/action-result";
import { baseUrl, devLoginEnabled, env, googleConfigured, googlePickerConfig, resetEnvCache } from "@/lib/env";
import { formatCount, plural, relativeTime, shortDate } from "@/lib/format";
import { isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/http";
import { clientIp, describeUserAgent, userAgent } from "@/lib/request";
import { dataThemeFor, parseThemePreference } from "@/lib/theme";

const db = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  rateLimit: { deleteMany: vi.fn() },
  form: { update: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
  auditEvent: { create: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const { pruneRateLimits, rateLimit } = await import("@/lib/rate-limit");
const { completionRate, countView } = await import("@/lib/forms/views");
const { getFormAccess } = await import("@/lib/forms/access");
const { loadCollaboration } = await import("@/lib/forms/collaboration");
const { recordAudit } = await import("@/lib/audit");

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("http helpers", () => {
  it("shapes JSON responses that are never cached", async () => {
    const error = jsonError(429, "rate_limited", "Slow down", { retryAfter: 5 });
    expect(error.status).toBe(429);
    expect(error.headers.get("cache-control")).toBe("no-store");
    expect(await error.json()).toEqual({ ok: false, error: "rate_limited", message: "Slow down", retryAfter: 5 });
    const success = jsonOk({ responseId: "r1" }, 201);
    expect(success.status).toBe(201);
    expect(await success.json()).toEqual({ ok: true, responseId: "r1" });
  });

  it("accepts same-origin requests only", () => {
    const request = (headers: Record<string, string>) => new Request("http://localhost:3000/api/x", { method: "POST", headers });
    expect(isSameOrigin(request({ origin: "http://localhost:3000" }), "http://localhost:3000")).toBe(true);
    expect(isSameOrigin(request({ origin: "https://evil.example" }), "http://localhost:3000")).toBe(false);
    expect(isSameOrigin(request({}), "http://localhost:3000")).toBe(true);
    expect(isSameOrigin(request({ "sec-fetch-site": "cross-site" }), "http://localhost:3000")).toBe(false);
  });

  it("reads JSON bodies within a byte cap", async () => {
    const post = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost/x", { method: "POST", body, headers });
    expect(await readJson(post('{"a":1}'), 100)).toEqual({ ok: true, value: { a: 1 } });
    expect(await readJson(post("{not json"), 100)).toEqual({ ok: false, reason: "invalid" });
    expect(await readJson(post("x".repeat(200)), 100)).toEqual({ ok: false, reason: "too_large" });
    expect(await readJson(post("{}", { "content-length": "5000" }), 100)).toEqual({ ok: false, reason: "too_large" });
  });

  it("returns action results as values", () => {
    expect(ok()).toEqual({ ok: true, data: undefined });
    expect(ok({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
    expect(fail("Nope", { code: "x" })).toEqual({ ok: false, error: "Nope", code: "x" });
  });
});

describe("request metadata", () => {
  it("finds the client IP and a short user agent", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBeNull();
    expect(userAgent(new Headers({ "user-agent": "x".repeat(400) }))).toHaveLength(300);
    expect(userAgent(new Headers())).toBeNull();
  });

  it("describes devices", () => {
    expect(describeUserAgent(null)).toBe("Unknown device");
    expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Version/18.0 Safari/604.1")).toBe("Safari on iOS");
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0")).toBe("Edge on Windows");
    expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0; rv:131.0) Gecko Firefox/131.0")).toBe("Firefox on macOS");
    expect(describeUserAgent("Mozilla/5.0 (X11; CrOS x86_64) Chrome/140.0 OPR/110.0")).toBe("Opera on ChromeOS");
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64) SamsungBrowser/25.0")).toBe("Samsung Internet on Linux");
    expect(describeUserAgent("curl/8.0")).toBe("Browser on Unknown OS");
  });
});

describe("formatting", () => {
  const now = new Date(2026, 10, 8, 12, 0, 0);
  it("shows short dates and relative times", () => {
    expect(shortDate(new Date(2026, 0, 11), now)).toBe("11 Jan");
    expect(shortDate(new Date(2025, 11, 31), now)).toBe("31 Dec 2025");
    expect(relativeTime(new Date(now.getTime() - 10_000), now)).toBe("just now");
    expect(relativeTime(new Date(now.getTime() - 60_000), now)).toBe("1 minute ago");
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 minutes ago");
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 hours ago");
    expect(relativeTime(new Date(now.getTime() - 26 * 3_600_000), now)).toBe("yesterday");
    expect(relativeTime(new Date(now.getTime() - 3 * 86_400_000), now)).toBe("3 days ago");
    expect(relativeTime(new Date(2026, 9, 1), now)).toBe("1 Oct");
  });

  it("formats counts", () => {
    expect(formatCount(1280)).toBe("1,280");
    expect(plural(1, "response")).toBe("1 response");
    expect(plural(3, "person", "people")).toBe("3 people");
  });

  it("parses the theme preference", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("purple")).toBe("system");
    expect(dataThemeFor("system")).toBeUndefined();
    expect(dataThemeFor("light")).toBe("light");
  });
});

describe("configuration", () => {
  it("reads and caches the environment", () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://forms.example.org///");
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "  ");
    resetEnvCache();
    expect(baseUrl()).toBe("https://forms.example.org");
    expect(googleConfigured()).toBe(false);
    expect(env()).toBe(env());
  });

  it("enables Google Picker only with OAuth, an API key and a project number", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    vi.stubEnv("GOOGLE_API_KEY", "key");
    vi.stubEnv("GOOGLE_PROJECT_NUMBER", "123456789012");
    resetEnvCache();
    expect(googlePickerConfig()).toEqual({ apiKey: "key", appId: "123456789012" });
    vi.stubEnv("GOOGLE_PROJECT_NUMBER", "my-project");
    resetEnvCache();
    expect(googlePickerConfig()).toBeNull();
    vi.stubEnv("GOOGLE_PROJECT_NUMBER", "123456789012");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    resetEnvCache();
    expect(googlePickerConfig()).toBeNull();
  });

  it("only enables dev login in development", () => {
    vi.stubEnv("DEV_LOGIN", "1");
    vi.stubEnv("NODE_ENV", "development");
    resetEnvCache();
    expect(devLoginEnabled()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    expect(devLoginEnabled()).toBe(false);
  });

  it("explains what is wrong with a bad configuration", () => {
    vi.stubEnv("ENCRYPTION_KEY", "short");
    resetEnvCache();
    expect(() => env()).toThrow(/ENCRYPTION_KEY/);
  });
});

describe("rate limits", () => {
  it("counts per window and fails open when the database is down", async () => {
    db.$queryRaw.mockResolvedValueOnce([{ count: 3 }]);
    expect(await rateLimit("submit:f:ip", 5, 60)).toEqual({ allowed: true, remaining: 2 });
    db.$queryRaw.mockResolvedValueOnce([{ count: 6 }]);
    expect(await rateLimit("submit:f:ip", 5, 60)).toEqual({ allowed: false, remaining: 0 });
    db.$queryRaw.mockRejectedValueOnce(new Error("down"));
    expect(await rateLimit("submit:f:ip", 5, 60)).toEqual({ allowed: true, remaining: 5 });
  });

  it("prunes old windows", async () => {
    db.rateLimit.deleteMany.mockResolvedValue({ count: 4 });
    expect(await pruneRateLimits(60)).toBe(4);
  });
});

describe("views and access", () => {
  it("counts views without ever failing the page", async () => {
    db.form.update.mockResolvedValueOnce({});
    await countView("form-1");
    db.form.update.mockRejectedValueOnce(new Error("down"));
    await expect(countView("form-1")).resolves.toBeUndefined();
    expect(completionRate(3, 4)).toBeNull();
    expect(completionRate(3, 10)).toBe(30);
    expect(completionRate(30, 10)).toBe(100);
  });

  it("grants owners and editors, and only owners for owner actions", async () => {
    const formId = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";
    expect(await getFormAccess("not-a-uuid", "u1", "edit")).toBeNull();
    db.form.findFirst.mockResolvedValueOnce(null);
    expect(await getFormAccess(formId, "u1", "edit")).toBeNull();
    db.form.findFirst.mockResolvedValueOnce({ id: formId, ownerId: "u1" });
    expect(await getFormAccess(formId, "u1", "own")).toMatchObject({ role: "owner" });
    db.form.findFirst.mockResolvedValueOnce({ id: formId, ownerId: "u2" });
    expect(await getFormAccess(formId, "u1", "edit", { includeTrashed: true })).toMatchObject({ role: "editor" });
    expect(db.form.findFirst.mock.calls[1][0].where).toMatchObject({ ownerId: "u1", deletedAt: null });
    expect(db.form.findFirst.mock.calls[2][0].where).not.toHaveProperty("deletedAt");
  });

  it("lists the owner, editors and pending invites", async () => {
    const user = (id: string, extra = {}) => ({ id, fullName: `Person ${id}`, email: `${id}@x.org`, photoUrl: null, positionTitle: null, officeName: null, ...extra });
    db.form.findUnique.mockResolvedValueOnce({
      owner: user("u1", { positionTitle: "LCVP", officeName: "Beirut" }),
      collaborators: [{ user: user("u2") }],
      invites: [{ id: "i1", email: "new@x.org" }],
    });
    const result = await loadCollaboration("f1", "u2");
    expect(result).toMatchObject({ owner: { id: "u1", detail: "LCVP · Beirut" }, editors: [{ id: "u2", detail: null }], viewerIsOwner: false, viewerId: "u2" });
    db.form.findUnique.mockResolvedValueOnce(null);
    expect(await loadCollaboration("f1", "u2")).toBeNull();
  });
});

describe("activity log", () => {
  it("records events with a hashed IP and never throws", async () => {
    db.auditEvent.create.mockResolvedValueOnce({});
    await recordAudit({ type: "form.created", actorId: "u1", target: { type: "form", id: "f1" }, ip: "203.0.113.7", userAgent: "x".repeat(400) });
    const data = db.auditEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: "form.created", actorId: "u1", targetType: "form", targetId: "f1" });
    expect(data.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(data.userAgent).toHaveLength(300);
    db.auditEvent.create.mockRejectedValueOnce(new Error("down"));
    await expect(recordAudit({ type: "auth.sign_out" })).resolves.toBeUndefined();
  });
});
