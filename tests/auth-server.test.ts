import { afterEach, describe, expect, it, vi } from "vitest";

import { newSessionPayload, nowSeconds, sealSession, SESSION_COOKIE } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";

const m = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  db: {
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    formInvite: { findMany: vi.fn() },
    googleConnection: { findMany: vi.fn(async () => [] as Array<{ email: string }>) },
    $transaction: vi.fn(),
  },
  tx: { formCollaborator: { upsert: vi.fn() }, formInvite: { delete: vi.fn() } },
  adapterOptions: [] as unknown[],
  clientOptions: [] as unknown[],
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (m.cookies.has(name) ? { name, value: m.cookies.get(name) } : undefined) }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect, notFound: m.notFound }));
vi.mock("@prisma/client", async (original) => ({
  ...(await original<typeof import("@prisma/client")>()),
  PrismaClient: class {
    user = {};
    form = {};
    constructor(options: unknown) {
      m.clientOptions.push(options);
    }
    $disconnect() {}
  },
}));
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(options: unknown) {
      m.adapterOptions.push(options);
    }
  },
}));

const { getCurrentUser, getSession, requireAdmin, requireUser } = await import("@/lib/auth/current-user");
const { activePositions, fetchCurrentPerson, GisError } = await import("@/lib/auth/gis");
const { acceptPendingInvites, profileFromPerson, upsertUser } = await import("@/lib/auth/sign-in");

const USER_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";
const tokens = { accessToken: "at", refreshToken: "rt", expiresAt: nowSeconds() + 3600 };
const userRow = (patch: Record<string, unknown> = {}) => ({ id: USER_ID, aiesecPersonId: 5099966n, fullName: "Lina Haddad", email: "lina@example.org", photoUrl: null, officeName: "Beirut", positionTitle: "LCVP", googleConnections: [], ...patch });

afterEach(() => {
  m.cookies.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("current user (database mocked through the client)", () => {
  vi.doMock("@/lib/db", () => ({ db: m.db }));

  it("reads the signed-in user from the session cookie", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: m.db }));
    const fresh = await import("@/lib/auth/current-user");
    m.cookies.set(SESSION_COOKIE, await sealSession(newSessionPayload({ userId: USER_ID, personId: "5099966", tokens })));
    m.db.user.findUnique.mockResolvedValueOnce(userRow());
    expect(await fresh.getSession()).toMatchObject({ uid: USER_ID });
    expect(await fresh.getCurrentUser()).toMatchObject({ id: USER_ID, aiesecPersonId: "5099966", isAdmin: false, email: "lina@example.org", workEmail: null });
    // The connected AIESEC Google account is their work email.
    m.db.user.findUnique.mockResolvedValueOnce(userRow({ googleConnections: [{ email: "lina.haddad@aiesec.net" }] }));
    expect(await fresh.getCurrentUser()).toMatchObject({ workEmail: "lina.haddad@aiesec.net" });
    m.db.user.findUnique.mockResolvedValueOnce(userRow({ aiesecEmail: "lina@aiesec.net", googleConnections: [{ email: "lcvp.marketing@aiesec.net" }] }));
    expect(await fresh.getCurrentUser()).toMatchObject({ workEmail: "lina@aiesec.net", email: "lina@example.org" });
    m.db.user.findUnique.mockResolvedValueOnce(userRow({ aiesecPersonId: 1n }));
    expect(await fresh.getCurrentUser()).toBeNull();
    m.cookies.clear();
    expect(await fresh.getCurrentUser()).toBeNull();
  });

  it("redirects signed-out people and hides admin pages", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: m.db }));
    const fresh = await import("@/lib/auth/current-user");
    await expect(fresh.requireUser("/forms/x")).rejects.toMatchObject({ url: "/login?returnTo=%2Fforms%2Fx" });
    await expect(fresh.requireUser()).rejects.toMatchObject({ url: "/login" });
    m.cookies.set(SESSION_COOKIE, await sealSession(newSessionPayload({ userId: USER_ID, personId: "5099966", tokens })));
    m.db.user.findUnique.mockResolvedValue(userRow());
    expect(await fresh.requireUser()).toMatchObject({ id: USER_ID });
    await expect(fresh.requireAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
    vi.stubEnv("PLATFORM_ADMIN_PERSON_IDS", "5099966");
    (await import("@/lib/env")).resetEnvCache();
    expect(await fresh.requireAdmin()).toMatchObject({ isAdmin: true });
  });

  it("exports the request helpers", () => {
    expect(typeof getSession).toBe("function");
    expect(typeof getCurrentUser).toBe("function");
    expect(typeof requireUser).toBe("function");
    expect(typeof requireAdmin).toBe("function");
  });
});

describe("AIESEC identity", () => {
  const respond = (body: unknown, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  const person = { id: 5099966, full_name: "Lina Haddad", email: "lina@example.org", current_positions: [{ id: 1, title: "LCVP", office: { id: 100, name: "Beirut" } }, null, { id: 2, title: "Old", office: null }] };

  it("reads currentPerson with the member's own token", async () => {
    respond({ data: { currentPerson: person } });
    const result = await fetchCurrentPerson("member-token");
    expect(result.id).toBe("5099966");
    expect(activePositions(result)).toHaveLength(1);
    const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("member-token");
    expect(JSON.parse(String(init.body)).query).toContain("aiesec_email");
  });

  it("separates rejected tokens from outages", async () => {
    respond({}, 401);
    await expect(fetchCurrentPerson("t")).rejects.toMatchObject({ kind: "rejected" });
    respond({}, 502);
    await expect(fetchCurrentPerson("t")).rejects.toMatchObject({ kind: "unavailable" });
    respond({ data: { currentPerson: { id: "abc" } } });
    await expect(fetchCurrentPerson("t")).rejects.toBeInstanceOf(GisError);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    await expect(fetchCurrentPerson("t")).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("builds a profile from the person", () => {
    expect(profileFromPerson({ id: "1", full_name: "  ", email: " Lina@Example.org ", profile_photo: "http://insecure", current_positions: [] })).toEqual({
      fullName: "Member 1",
      email: "lina@example.org",
      aiesecEmail: null,
      photoUrl: null,
      officeId: null,
      officeName: null,
      positionTitle: null,
    });
    // The AIESEC work email is kept apart from the (often personal) EXPA sign-in email.
    expect(profileFromPerson({ id: "1", email: "lina@gmail.com", aiesec_email: " Lina.Haddad@AIESEC.net " })).toMatchObject({ email: "lina@gmail.com", aiesecEmail: "lina.haddad@aiesec.net" });
    expect(profileFromPerson({ id: "1", aiesec_email: "not an email" }).aiesecEmail).toBeNull();
    expect(profileFromPerson({ id: "1", profile_photo: "https://cdn/x.jpg", current_office: { id: "55", name: "Lebanon" }, current_positions: [{ id: "1", title: null, office: { id: "100" }, role: { id: "3", name: "Member" } }] })).toMatchObject({
      photoUrl: "https://cdn/x.jpg",
      officeId: 55n,
      officeName: "Lebanon",
      positionTitle: "Member",
    });
  });
});

describe("sign-in records (database mocked)", () => {
  it("upserts the user and turns invites into editor access", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db", () => ({ db: m.db }));
    const signIn = await import("@/lib/auth/sign-in");
    m.db.user.upsert.mockResolvedValueOnce(userRow());
    await signIn.upsertUser("5099966", profileFromPerson({ id: "5099966", full_name: "Lina" }));
    expect(m.db.user.upsert.mock.calls[0][0].where).toEqual({ aiesecPersonId: 5099966n });

    expect(await signIn.acceptPendingInvites(userRow({ email: null }) as never)).toBe(0);
    // Invites to their AIESEC address (from a connected Google account) count too.
    m.db.googleConnection.findMany.mockResolvedValueOnce([{ email: "Lina.Haddad@aiesec.net" }, { email: "lina@example.org" }]);
    m.db.formInvite.findMany.mockResolvedValueOnce([

      { id: "i1", formId: "f1", invitedById: "o1", form: { ownerId: "o1" } },
      { id: "i2", formId: "f2", invitedById: "o2", form: { ownerId: USER_ID } },
      { id: "i3", formId: "f3", invitedById: "o3", form: { ownerId: "o3" } },
    ]);
    m.db.$transaction
      .mockImplementationOnce(async (work: (tx: typeof m.tx) => Promise<void>) => work(m.tx))
      .mockImplementationOnce(async (work: (tx: typeof m.tx) => Promise<void>) => work(m.tx))
      .mockRejectedValueOnce(new Error("conflict"));
    expect(await signIn.acceptPendingInvites(userRow() as never)).toBe(1);
    expect(m.tx.formInvite.delete).toHaveBeenCalledTimes(2);
    expect(m.db.formInvite.findMany.mock.calls.at(-1)?.[0].where.email).toEqual({ in: ["lina@example.org", "lina.haddad@aiesec.net"] });
    m.db.googleConnection.findMany.mockResolvedValueOnce([]);
    m.db.formInvite.findMany.mockResolvedValueOnce([]);
    await signIn.acceptPendingInvites(userRow({ aiesecEmail: "lina.h@aiesec.net" }) as never);
    expect(m.db.formInvite.findMany.mock.calls.at(-1)?.[0].where.email).toEqual({ in: ["lina.h@aiesec.net", "lina@example.org"] });
  });

  it("exports the shared helpers", () => {
    expect(typeof upsertUser).toBe("function");
    expect(typeof acceptPendingInvites).toBe("function");
  });
});

describe("database client", () => {
  it("is created on first use with TLS for remote hosts", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/db");
    delete (globalThis as { __db?: unknown }).__db;
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@db.example.org:6543/postgres");
    resetEnvCache();
    const { db } = await import("@/lib/db");
    const freshEnv = await import("@/lib/env");
    expect(m.adapterOptions).toHaveLength(0);
    expect(typeof db.$disconnect).toBe("function");
    expect(m.adapterOptions[0]).toMatchObject({ connectionString: "postgresql://u:p@db.example.org:6543/postgres", ssl: { rejectUnauthorized: false }, max: 5 });

    delete (globalThis as { __db?: unknown }).__db;
    vi.stubEnv("DATABASE_CA_CERT", "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----");
    freshEnv.resetEnvCache();
    expect(db.user).toBeDefined();
    expect(m.adapterOptions[1]).toMatchObject({ ssl: { ca: "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----", rejectUnauthorized: true } });

    delete (globalThis as { __db?: unknown }).__db;
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/dev");
    freshEnv.resetEnvCache();
    expect(db.form).toBeDefined();
    expect((m.adapterOptions[2] as { ssl?: unknown }).ssl).toBeUndefined();
    delete (globalThis as { __db?: unknown }).__db;
  });
});
