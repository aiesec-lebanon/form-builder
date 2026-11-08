import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/lib/env";
import { blankDocument } from "@/lib/forms/templates";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getFormAccess: vi.fn(),
  recordAudit: vi.fn(),
  rateLimit: vi.fn(),
  testDestination: vi.fn(),
  listSummaries: vi.fn(),
  loadDestination: vi.fn(),
  recordHealth: vi.fn(),
  assertPublicHttpsUrl: vi.fn(),
  googleAccessToken: vi.fn(),
  createSpreadsheet: vi.fn(),
  createFolder: vi.fn(),
  moveToFolder: vi.fn(),
  formatSheet: vi.fn(),
  ensureFormFolder: vi.fn(),
  tx: { destination: { delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
  db: {
    destination: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    googleConnection: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/forms/access", () => ({ getFormAccess: m.getFormAccess }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }));
vi.mock("@/lib/destinations/deliver", () => ({ testDestination: m.testDestination }));
vi.mock("@/lib/destinations/store", () => ({ listSummaries: m.listSummaries, loadDestination: m.loadDestination, recordHealth: m.recordHealth }));
vi.mock("@/lib/net/guard", async (original) => ({ ...(await original<typeof import("@/lib/net/guard")>()), assertPublicHttpsUrl: m.assertPublicHttpsUrl }));
vi.mock("@/lib/google/tokens", () => ({ googleAccessToken: m.googleAccessToken }));
vi.mock("@/lib/google/api", async (original) => ({ ...(await original<typeof import("@/lib/google/api")>()), createSpreadsheet: m.createSpreadsheet, createFolder: m.createFolder, moveToFolder: m.moveToFolder, formatSheet: m.formatSheet }));
vi.mock("@/lib/google/folders", async (original) => ({ ...(await original<typeof import("@/lib/google/folders")>()), ensureFormFolder: m.ensureFormFolder }));
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const actions = await import("@/actions/destinations");
const { BlockedHostError } = await import("@/lib/net/guard");
const { GoogleApiError } = await import("@/lib/google/api");

const FORM_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";
const user = { id: "u1" };
const summaries = [{ id: "d1" }];

beforeEach(() => {
  m.getCurrentUser.mockResolvedValue(user);
  m.getFormAccess.mockResolvedValue({ form: { id: FORM_ID, draft: blankDocument("Recruitment") }, role: "owner" });
  m.rateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
  m.db.destination.count.mockResolvedValue(0);
  m.db.destination.create.mockImplementation(async ({ data }: { data: { role: string } }) => ({ id: "new", ...data }));
  m.listSummaries.mockResolvedValue(summaries);
  m.assertPublicHttpsUrl.mockImplementation(async (raw: string) => new URL(raw));
  m.testDestination.mockResolvedValue({ ok: true });
  m.formatSheet.mockResolvedValue(undefined);
  m.moveToFolder.mockResolvedValue(undefined);
  m.db.$transaction.mockImplementation(async (work: unknown) => (typeof work === "function" ? work(m.tx) : work));
  vi.stubEnv("GOOGLE_CLIENT_ID", "id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  resetEnvCache();
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("destination actions: access and probe limits", () => {
  it("needs a session, edit access and a free probe budget", async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await actions.addWebhook(FORM_ID, { url: "https://x.org" })).toMatchObject({ ok: false, error: expect.stringContaining("session") });
    m.getFormAccess.mockResolvedValueOnce(null);
    expect(await actions.removeDestination(FORM_ID, "d1")).toMatchObject({ ok: false });
    m.rateLimit.mockResolvedValue({ allowed: false, remaining: 0 });
    for (const result of [
      await actions.addWebhook(FORM_ID, { url: "https://x.org" }),
      await actions.addSupabase(FORM_ID, { projectUrl: "https://a.supabase.co", table: "t", apiKey: "k".repeat(30) }),
      await actions.addPostgres(FORM_ID, { connectionString: "postgresql://u:p@db.example.org/app", table: "t" }),
      await actions.testDestinationAction(FORM_ID, "d1"),
    ])
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining("Wait a few minutes") });
    for (const action of [actions.revealWebhookSecret, actions.makePrimary, actions.testDestinationAction]) {
      m.getCurrentUser.mockResolvedValueOnce(null);
      expect(await action(FORM_ID, "d1")).toMatchObject({ ok: false });
    }
    for (const action of [actions.addSupabase, actions.addPostgres, actions.addGoogleSheet, actions.addGoogleDrive]) {
      m.getCurrentUser.mockResolvedValueOnce(null);
      expect(await action(FORM_ID, {} as never)).toMatchObject({ ok: false });
    }
  });
});

describe("webhooks", () => {
  it("adds a webhook as primary and returns its signing secret once", async () => {
    const result = await actions.addWebhook(FORM_ID, { url: " https://hooks.example.org/in " });
    expect(result).toMatchObject({ ok: true, data: { destinations: summaries, signingSecret: expect.stringMatching(/^whsec_/) } });
    expect(m.db.destination.create.mock.calls[0][0].data).toMatchObject({ type: "webhook", role: "primary", config: { url: "https://hooks.example.org/in" } });
    expect(m.db.destination.create.mock.calls[0][0].data.secretsEnc).not.toContain("whsec_");
  });

  it("refuses empty, private and unknown addresses", async () => {
    expect(await actions.addWebhook(FORM_ID, { url: "  " })).toMatchObject({ ok: false, fieldErrors: { url: "Enter the webhook URL." } });
    m.assertPublicHttpsUrl.mockRejectedValueOnce(new BlockedHostError());
    expect(await actions.addWebhook(FORM_ID, { url: "https://10.0.0.1" })).toMatchObject({ ok: false, error: expect.stringContaining("private") });
    m.assertPublicHttpsUrl.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await actions.addWebhook(FORM_ID, { url: "https://nope.example" })).toMatchObject({ ok: false, error: expect.stringContaining("couldn't find") });
  });

  it("adds later destinations as secondary, also when two primaries race", async () => {
    m.db.destination.count.mockResolvedValueOnce(1);
    await actions.addWebhook(FORM_ID, { url: "https://hooks.example.org/a" });
    expect(m.db.destination.create.mock.calls[0][0].data.role).toBe("secondary");
    m.db.destination.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" }));
    await actions.addWebhook(FORM_ID, { url: "https://hooks.example.org/b" });
    expect(m.db.destination.create.mock.calls.at(-1)?.[0].data.role).toBe("secondary");
    m.db.destination.create.mockRejectedValueOnce(new Error("db down"));
    await expect(actions.addWebhook(FORM_ID, { url: "https://hooks.example.org/c" })).rejects.toThrow("db down");
  });

  it("reveals the signing secret to editors", async () => {
    m.loadDestination.mockResolvedValueOnce({ type: "webhook", secrets: { signingSecret: "whsec_x" } });
    expect(await actions.revealWebhookSecret(FORM_ID, "d1")).toEqual({ ok: true, data: { signingSecret: "whsec_x" } });
    m.loadDestination.mockResolvedValueOnce({ type: "supabase", secrets: {} });
    expect(await actions.revealWebhookSecret(FORM_ID, "d1")).toMatchObject({ ok: false });
  });
});

describe("databases", () => {
  it("adds Supabase after a successful test", async () => {
    const result = await actions.addSupabase(FORM_ID, { projectUrl: "https://abc.supabase.co/rest", table: "form_responses", apiKey: "sb_secret_" + "k".repeat(30) });
    expect(result).toMatchObject({ ok: true });
    expect(m.db.destination.create.mock.calls[0][0].data.config).toEqual({ projectUrl: "https://abc.supabase.co", schema: "public", table: "form_responses" });
    expect(m.recordHealth).toHaveBeenCalledWith("new", { ok: true });
  });

  it("checks Supabase input and reports failed tests", async () => {
    expect(await actions.addSupabase(FORM_ID, { projectUrl: "", table: "", apiKey: "short" })).toMatchObject({ ok: false, fieldErrors: { projectUrl: expect.any(String), table: expect.any(String), apiKey: expect.any(String) } });
    expect(await actions.addSupabase(FORM_ID, { projectUrl: "https://a.supabase.co", table: "bad table", apiKey: "k".repeat(30) })).toMatchObject({ ok: false, fieldErrors: { table: expect.any(String) } });
    expect(await actions.addSupabase(FORM_ID, { projectUrl: "https://a.supabase.co", schema: "bad-schema", table: "t", apiKey: "k".repeat(30) })).toMatchObject({ ok: false, fieldErrors: { schema: expect.any(String) } });
    m.assertPublicHttpsUrl.mockRejectedValueOnce(new BlockedHostError());
    expect(await actions.addSupabase(FORM_ID, { projectUrl: "https://localhost", table: "t", apiKey: "k".repeat(30) })).toMatchObject({ ok: false, fieldErrors: { projectUrl: expect.any(String) } });
    m.testDestination.mockResolvedValueOnce({ ok: false, retryable: false, message: "Supabase refused the key." });
    expect(await actions.addSupabase(FORM_ID, { projectUrl: "https://a.supabase.co", table: "t", apiKey: "k".repeat(30) })).toEqual({ ok: false, error: "Supabase refused the key." });
  });

  it("adds PostgreSQL after a successful test", async () => {
    expect(await actions.addPostgres(FORM_ID, { connectionString: "postgresql://forms:pw@db.example.org:5432/app", table: "form_responses" })).toMatchObject({ ok: true });
    expect(m.db.destination.create.mock.calls[0][0].data.config).toEqual({ host: "db.example.org", database: "app", schema: "public", table: "form_responses" });
  });

  it("checks PostgreSQL input and reports failed tests", async () => {
    expect(await actions.addPostgres(FORM_ID, { connectionString: "short", table: "" })).toMatchObject({ ok: false, fieldErrors: { connectionString: expect.any(String), table: expect.any(String) } });
    expect(await actions.addPostgres(FORM_ID, { connectionString: "postgresql://u:p@db.example.org/app", table: "1bad" })).toMatchObject({ ok: false, fieldErrors: { table: expect.any(String) } });
    expect(await actions.addPostgres(FORM_ID, { connectionString: "postgresql://u:p@db.example.org/app", schema: "x y", table: "t" })).toMatchObject({ ok: false, fieldErrors: { schema: expect.any(String) } });
    expect(await actions.addPostgres(FORM_ID, { connectionString: "mysql://u:p@db.example.org/app", table: "t" })).toMatchObject({ ok: false, fieldErrors: { connectionString: expect.any(String) } });
    m.testDestination.mockResolvedValueOnce({ ok: false, retryable: false, message: "The table doesn't exist." });
    expect(await actions.addPostgres(FORM_ID, { connectionString: "postgresql://u:p@db.example.org/app", table: "t" })).toEqual({ ok: false, error: "The table doesn't exist." });
  });
});

describe("Google destinations", () => {
  it("creates the response Sheet inside the form's folder, formatted", async () => {
    m.db.googleConnection.findFirst.mockResolvedValue({ id: "c1" });
    m.googleAccessToken.mockResolvedValue("tok");
    m.ensureFormFolder.mockResolvedValue({ id: "form-folder-1", url: "https://drive/f", name: "Recruitment", takenName: null });
    m.createSpreadsheet.mockResolvedValueOnce({ spreadsheetId: "s1", spreadsheetUrl: "https://docs/s1", sheetId: 0, sheetTitle: "Responses" });
    m.formatSheet.mockRejectedValueOnce(new Error("cosmetic"));
    expect(await actions.addGoogleSheet(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: true, data: { notice: null } });
    expect(m.createSpreadsheet.mock.calls[0][1]).toBe("Recruitment Responses");
    expect(m.moveToFolder).toHaveBeenCalledWith("tok", "s1", "form-folder-1");
    expect(m.db.destination.create.mock.calls[0][0].data).toMatchObject({ type: "google_sheets", googleConnectionId: "c1", config: { spreadsheetId: "s1", formFolderId: "form-folder-1", columns: expect.any(Array) } });
    m.ensureFormFolder.mockResolvedValueOnce({ id: "form-folder-2", url: "https://drive/f2", name: "Recruitment (2)", takenName: "Recruitment" });
    m.createSpreadsheet.mockResolvedValueOnce({ spreadsheetId: "s2", spreadsheetUrl: "https://docs/s2", sheetId: 0, sheetTitle: "Responses" });
    expect(await actions.addGoogleSheet(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: true, data: { notice: expect.stringContaining('"Recruitment (2)"') } });
    m.createSpreadsheet.mockRejectedValueOnce(new GoogleApiError(403, "", "no"));
    expect(await actions.addGoogleSheet(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: expect.stringContaining("refused") });
    m.getFormAccess.mockResolvedValueOnce({ form: { id: FORM_ID, draft: {} }, role: "owner" });
    expect(await actions.addGoogleSheet(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: "This form couldn't be read." });
    m.db.googleConnection.findFirst.mockResolvedValueOnce(null);
    expect(await actions.addGoogleSheet(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: "Connect your Google account first." });
  });

  it("keeps uploads in the form's folder, one subfolder per question", async () => {
    m.db.googleConnection.findFirst.mockResolvedValue({ id: "c1" });
    m.googleAccessToken.mockResolvedValue("tok");
    m.ensureFormFolder.mockResolvedValueOnce({ id: "folder-0001", url: "https://drive/f", name: "Recruitment", takenName: null });
    expect(await actions.addGoogleDrive(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: true });
    expect(m.db.destination.create.mock.calls[0][0].data).toMatchObject({ type: "google_drive", role: "files", config: { folderId: "folder-0001", formFolderId: "folder-0001", questionFolders: {} } });
    m.ensureFormFolder.mockRejectedValueOnce(new GoogleApiError(500, "", "busy"));
    expect(await actions.addGoogleDrive(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: expect.stringContaining("busy") });
    m.db.destination.count.mockResolvedValueOnce(1);
    expect(await actions.addGoogleDrive(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: expect.stringContaining("already") });
    m.db.googleConnection.findFirst.mockResolvedValueOnce(null);
    expect(await actions.addGoogleDrive(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false });
  });

  it("needs Google configured on the server", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    resetEnvCache();
    expect(await actions.addGoogleSheet(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: expect.stringContaining("isn't set up") });
    expect(await actions.addGoogleDrive(FORM_ID, { connectionId: "c1" })).toMatchObject({ ok: false, error: expect.stringContaining("isn't set up") });
  });
});

describe("managing destinations", () => {
  it("tests a destination and records its health", async () => {
    m.loadDestination.mockResolvedValueOnce(null);
    expect(await actions.testDestinationAction(FORM_ID, "gone")).toMatchObject({ ok: false });
    m.loadDestination.mockResolvedValueOnce({ id: "d1" });
    m.testDestination.mockResolvedValueOnce({ ok: false, retryable: true, message: "HTTP 500" });
    expect(await actions.testDestinationAction(FORM_ID, "d1")).toEqual({ ok: true, data: { destinations: summaries, passed: false, message: "HTTP 500" } });
    m.loadDestination.mockResolvedValueOnce({ id: "d1" });
    expect(await actions.testDestinationAction(FORM_ID, "d1")).toMatchObject({ ok: true, data: { passed: true, message: null } });
  });

  it("removes destinations and promotes the next one to primary", async () => {
    m.db.destination.findFirst.mockResolvedValueOnce(null);
    expect(await actions.removeDestination(FORM_ID, "gone")).toEqual({ ok: true, data: { destinations: summaries } });
    m.db.destination.findFirst.mockResolvedValueOnce({ id: "d1", role: "primary", type: "webhook" });
    m.tx.destination.findFirst.mockResolvedValueOnce({ id: "d2" });
    expect(await actions.removeDestination(FORM_ID, "d1")).toMatchObject({ ok: true });
    expect(m.tx.destination.update).toHaveBeenCalledWith({ where: { id: "d2" }, data: { role: "primary" } });
    m.db.destination.findFirst.mockResolvedValueOnce({ id: "d3", role: "secondary", type: "webhook" });
    await actions.removeDestination(FORM_ID, "d3");
    expect(m.tx.destination.update).toHaveBeenCalledTimes(1);
  });

  it("makes a secondary destination the primary", async () => {
    m.db.destination.findFirst.mockResolvedValueOnce(null);
    expect(await actions.makePrimary(FORM_ID, "d1")).toMatchObject({ ok: true });
    m.db.destination.findFirst.mockResolvedValueOnce({ id: "d2" });
    expect(await actions.makePrimary(FORM_ID, "d2")).toMatchObject({ ok: true });
    expect(m.db.$transaction).toHaveBeenCalled();
  });
});
