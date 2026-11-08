import { afterEach, describe, expect, it, vi } from "vitest";

import { encryptJson } from "@/lib/crypto";
import type { LoadedDestination } from "@/lib/destinations/types";
import { buildPayload } from "@/lib/forms/payload";
import { blankDocument } from "@/lib/forms/templates";

const db = vi.hoisted(() => ({ destination: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
const net = vi.hoisted(() => ({ guardedFetch: vi.fn(), resolvePublicHost: vi.fn() }));
vi.mock("@/lib/net/guard", async (original) => ({ ...(await original<typeof import("@/lib/net/guard")>()), guardedFetch: net.guardedFetch, resolvePublicHost: net.resolvePublicHost }));
const google = vi.hoisted(() => ({ getFile: vi.fn(), appendRow: vi.fn(), writeHeaderRow: vi.fn(), sheetTitleById: vi.fn(), token: vi.fn() }));
vi.mock("@/lib/google/api", async (original) => ({
  ...(await original<typeof import("@/lib/google/api")>()),
  getFile: google.getFile,
  appendRow: google.appendRow,
  writeHeaderRow: google.writeHeaderRow,
  sheetTitleById: google.sheetTitleById,
}));
vi.mock("@/lib/google/tokens", () => ({ googleAccessToken: google.token }));
const pgState = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn(), options: [] as unknown[] }));
vi.mock("pg", () => ({
  default: {
    Client: class {
      constructor(options: unknown) {
        pgState.options.push(options);
      }
      on() {}
      connect = () => pgState.connect();
      end = () => Promise.resolve(pgState.end());
      query = (...args: unknown[]) => pgState.query(...args);
    },
  },
}));

const { listSummaries, loadDestination, loadDestinations, recordHealth, summarize } = await import("@/lib/destinations/store");
const { prepareDestinations } = await import("@/lib/destinations/prepare");
const { adapterFor } = await import("@/lib/destinations/registry");
const { classifyError } = await import("@/lib/destinations/errors");
const { GoogleApiError } = await import("@/lib/google/api");
const { GoogleAuthError } = await import("@/lib/google/oauth");
const { BlockedHostError } = await import("@/lib/net/guard");

const doc = blankDocument("Recruitment");
const payload = buildPayload({ responseId: "0b7d3f8e-2c1a-4f5e-9d6b-1a2b3c4d5e6f", submittedAt: new Date("2026-11-08T10:00:00Z"), form: { id: "form-1", slug: "recruitment" }, doc, values: {} });
const context = { payload, doc, values: {} };
const destination = (patch: Partial<LoadedDestination>): LoadedDestination => ({
  id: "d1",
  formId: "form-1",
  type: "webhook",
  role: "primary",
  name: "Destination",
  config: {},
  secrets: null,
  googleConnectionId: null,
  ...patch,
});
const response = (status: number, body = "") => ({ status, ok: status >= 200 && status < 300, headers: new Headers(), text: async () => body });
const row = (patch: Record<string, unknown> = {}) => ({
  id: "d1",
  formId: "form-1",
  type: "webhook",
  role: "primary",
  name: "Webhook",
  enabled: true,
  config: { url: "https://hooks.example.org/in" },
  secretsEnc: null as string | null,
  googleConnectionId: null,
  consecutiveFailures: 0,
  lastSuccessAt: null as Date | null,
  lastFailureAt: null as Date | null,
  lastError: null as string | null,
  googleConnection: null as { email: string; status: string } | null,
  ...patch,
});

afterEach(() => {
  vi.clearAllMocks();
  pgState.options.length = 0;
});

describe("destination store", () => {
  it("loads destinations with their secrets decrypted", async () => {
    db.destination.findMany.mockResolvedValueOnce([row({ secretsEnc: encryptJson({ signingSecret: "s".repeat(20) }) }), row({ id: "d2", secretsEnc: "unreadable" })]);
    const loaded = await loadDestinations("form-1", ["primary"]);
    expect(loaded[0].secrets).toEqual({ signingSecret: "s".repeat(20) });
    expect(loaded[1].secrets).toBeNull();
    expect(db.destination.findMany.mock.calls[0][0].where).toMatchObject({ formId: "form-1", enabled: true, role: { in: ["primary"] } });
    db.destination.findFirst.mockResolvedValueOnce(null);
    expect(await loadDestination("form-1", "missing")).toBeNull();
    db.destination.findFirst.mockResolvedValueOnce(row());
    expect(await loadDestination("form-1", "d1")).toMatchObject({ id: "d1", type: "webhook" });
  });

  it("records delivery health and never throws", async () => {
    await recordHealth("d1", { ok: true });
    expect(db.destination.update.mock.calls[0][0].data).toMatchObject({ consecutiveFailures: 0, lastError: null });
    await recordHealth("d1", { ok: false, retryable: true, message: "x".repeat(400) });
    expect(db.destination.update.mock.calls[1][0].data.lastError).toHaveLength(300);
    db.destination.update.mockRejectedValueOnce(new Error("down"));
    await expect(recordHealth("d1", { ok: true })).resolves.toBeUndefined();
  });

  it("summarizes each destination for owners", async () => {
    expect(summarize(row() as never)).toMatchObject({ detail: "hooks.example.org/in", health: "untested" });
    expect(summarize(row({ config: { url: "https://hooks.example.org/" }, lastSuccessAt: new Date() }) as never)).toMatchObject({ detail: "hooks.example.org", health: "working" });
    expect(summarize(row({ config: { url: "not a url" } }) as never).detail).toBe("Webhook");
    expect(summarize(row({ type: "supabase", config: { projectUrl: "https://abc.supabase.co", table: "form_responses" } }) as never).detail).toBe("public.form_responses on abc.supabase.co");
    expect(summarize(row({ type: "supabase", config: { projectUrl: "bad", schema: "forms", table: "t" } }) as never).detail).toBe("forms.t on ");
    expect(summarize(row({ type: "postgres", config: { host: "db.example.org", table: "t" } }) as never).detail).toBe("public.t on db.example.org");
    expect(summarize(row({ type: "google_sheets", config: { sheetTitle: "Responses", spreadsheetUrl: "https://docs/s" } }) as never)).toMatchObject({ detail: 'Tab "Responses"', link: "https://docs/s" });
    expect(summarize(row({ type: "google_drive", config: {} }) as never)).toMatchObject({ detail: "Uploads folder in Google Drive", link: null });
    const revoked = summarize(row({ type: "google_sheets", config: {}, googleConnection: { email: "a@b.c", status: "revoked" } }) as never);
    expect(revoked).toMatchObject({ health: "failing", connectedVia: "a@b.c", lastError: expect.stringContaining("Reconnect Google") });
    db.destination.findMany.mockResolvedValueOnce([row({ consecutiveFailures: 2, lastFailureAt: new Date(0), lastError: "HTTP 500" })]);
    expect(await listSummaries("form-1")).toMatchObject([{ health: "failing", lastError: "HTTP 500", lastFailureAt: "1970-01-01T00:00:00.000Z" }]);
  });
});

describe("publishing preparation", () => {
  it("collects readable warnings and keeps going", async () => {
    db.destination.findMany.mockResolvedValueOnce([
      row({ id: "w", type: "webhook" }),
      row({ id: "s1", type: "google_sheets", name: "Sheet", config: {} }),
    ]);
    expect(await prepareDestinations("form-1", doc)).toEqual(["Sheet: This Google Sheet connection is incomplete. Remove it and add it again."]);
    db.destination.findMany.mockResolvedValueOnce([
      row({
        id: "s2",
        type: "google_sheets",
        name: "Broken sheet",
        googleConnectionId: "c1",
        config: { spreadsheetId: "spreadsheet-1", spreadsheetUrl: "https://docs/s", sheetId: 0, sheetTitle: "Responses", columns: [] },
      }),
    ]);
    google.token.mockResolvedValueOnce("tok");
    google.writeHeaderRow.mockRejectedValueOnce(new GoogleApiError(500, "backendError", "boom"));
    expect(await prepareDestinations("form-1", doc)).toEqual(["Broken sheet: Google is busy right now. Responses will retry."]);
  });

  it("knows an adapter for every destination type", () => {
    for (const type of ["google_sheets", "google_drive", "webhook", "supabase", "postgres"] as const) expect(adapterFor(type).type).toBe(type);
  });
});

describe("error classification", () => {
  it("turns failures into safe messages", () => {
    expect(classifyError(new BlockedHostError())).toMatchObject({ ok: false, retryable: false });
    expect(classifyError(new GoogleAuthError("unavailable", "x"))).toMatchObject({ retryable: true, message: "Google sign-in is unavailable right now." });
    expect(classifyError(new GoogleApiError(404, "", "x"))).toMatchObject({ retryable: false, message: expect.stringContaining("deleted") });
    expect(classifyError(new GoogleApiError(403, "", "x"))).toMatchObject({ retryable: false, message: expect.stringContaining("refused") });
    expect(classifyError(new GoogleApiError(503, "", "x"))).toMatchObject({ retryable: true });
    expect(classifyError(new GoogleApiError(400, "", "bad range"))).toMatchObject({ retryable: false, message: "Google rejected the request (bad range)." });
    expect(classifyError(Object.assign(new Error("t"), { name: "TimeoutError" }))).toMatchObject({ message: expect.stringContaining("10 seconds") });
    expect(classifyError("weird")).toMatchObject({ message: "Couldn't reach the destination." });
  });
});

describe("adapters", () => {
  it("webhook: posts signed JSON and checks settings", async () => {
    const hook = destination({ config: { url: "https://hooks.example.org/in" }, secrets: { signingSecret: "s".repeat(24) } });
    net.guardedFetch.mockResolvedValue(response(200));
    expect(await adapterFor("webhook").deliver!(hook, context)).toEqual({ ok: true });
    const headers = net.guardedFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(payload.responseId);
    expect(headers["X-AIESEC-Forms-Event"]).toBe("response.created");
    expect(await adapterFor("webhook").test!(hook)).toEqual({ ok: true });
    expect(JSON.parse(net.guardedFetch.mock.calls[1][1].body as string)).toMatchObject({ event: "test", formId: "form-1" });
    expect(await adapterFor("webhook").deliver!(destination({}), context)).toMatchObject({ ok: false, retryable: false });
    expect(await adapterFor("webhook").test!(destination({}))).toMatchObject({ ok: false });
  });

  it("supabase: inserts idempotently and explains refusals", async () => {
    const supabase = destination({ type: "supabase", config: { projectUrl: "https://abc.supabase.co/", table: "form_responses" }, secrets: { apiKey: "sb_secret_" + "k".repeat(30) } });
    net.guardedFetch.mockResolvedValueOnce(response(201));
    expect(await adapterFor("supabase").deliver!(supabase, context)).toEqual({ ok: true });
    expect(net.guardedFetch.mock.calls[0][0]).toBe("https://abc.supabase.co/rest/v1/form_responses?on_conflict=response_id");
    expect(JSON.parse(net.guardedFetch.mock.calls[0][1].body as string)).toMatchObject({ response_id: payload.responseId, form_id: "form-1" });
    const cases: Array<[number, string, RegExp, boolean]> = [
      [401, "", /refused the key/, false],
      [404, "", /couldn't find that table/, false],
      [503, "", /HTTP 503/, true],
      [400, JSON.stringify({ code: "23502", message: "null value" }), /23502: null value/, false],
      [400, "not json", /rejected the row\. Check/, false],
    ];
    for (const [status, body, message, retryable] of cases) {
      net.guardedFetch.mockResolvedValueOnce(response(status, body));
      expect(await adapterFor("supabase").test!(supabase)).toMatchObject({ ok: false, retryable, message: expect.stringMatching(message) });
    }
    expect(await adapterFor("supabase").deliver!(destination({ type: "supabase" }), context)).toMatchObject({ ok: false, retryable: false });
    expect(await adapterFor("supabase").test!(destination({ type: "supabase" }))).toMatchObject({ ok: false });
  });

  it("postgres: connects to the vetted address and inserts once", async () => {
    const postgres = destination({ type: "postgres", config: { host: "db.example.org", database: "app", table: "form_responses" }, secrets: { connectionString: "postgresql://forms:p%40ss@db.example.org:6543/app" } });
    net.resolvePublicHost.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    pgState.query.mockResolvedValue({ rows: [] });
    expect(await adapterFor("postgres").deliver!(postgres, context)).toEqual({ ok: true });
    expect(pgState.options[0]).toMatchObject({ host: "93.184.216.34", port: 6543, user: "forms", password: "p@ss", ssl: { servername: "db.example.org" } });
    expect(pgState.query.mock.calls[0][0]).toContain('INSERT INTO "public"."form_responses"');
    expect(pgState.end).toHaveBeenCalled();

    pgState.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ column_name: "response_id" }, { column_name: "data" }] });
    expect(await adapterFor("postgres").test!(postgres)).toMatchObject({ ok: false, message: "The table is missing: form_id, submitted_at. Run the setup SQL." });
    pgState.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: ["response_id", "form_id", "submitted_at", "data"].map((column_name) => ({ column_name })) });
    expect(await adapterFor("postgres").test!(postgres)).toEqual({ ok: true });

    pgState.connect.mockRejectedValueOnce(Object.assign(new Error("auth"), { code: "28P01" }));
    expect(await adapterFor("postgres").deliver!(postgres, context)).toMatchObject({ ok: false, message: expect.stringContaining("username or password") });
    const invalid = destination({ ...postgres, secrets: { connectionString: "mysql://nope" } });
    expect(await adapterFor("postgres").test!(invalid)).toMatchObject({ ok: false, message: expect.stringContaining("postgresql://") });
    expect(await adapterFor("postgres").deliver!(destination({ type: "postgres" }), context)).toMatchObject({ ok: false, retryable: false });
    expect(await adapterFor("postgres").test!(destination({ type: "postgres" }))).toMatchObject({ ok: false });
  });

  it("drive: checks the uploads folder is still there", async () => {
    const drive = destination({ type: "google_drive", role: "files", googleConnectionId: "c1", config: { folderId: "folder-0001", folderUrl: "https://drive.google.com/drive/folders/folder-0001" } });
    google.token.mockResolvedValue("tok");
    google.getFile.mockResolvedValueOnce({ id: "folder-0001", trashed: false });
    expect(await adapterFor("google_drive").test!(drive)).toEqual({ ok: true });
    google.getFile.mockResolvedValueOnce({ id: "folder-0001", trashed: true });
    expect(await adapterFor("google_drive").test!(drive)).toMatchObject({ ok: false, message: expect.stringContaining("trash") });
    expect(await adapterFor("google_drive").test!(destination({ type: "google_drive" }))).toMatchObject({ ok: false });
  });

  it("sheets: appends rows, follows renamed tabs and catches up on columns", async () => {
    const config = { spreadsheetId: "spreadsheet-1", spreadsheetUrl: "https://docs/s", sheetId: 7, sheetTitle: "Responses", columns: [] as Array<{ fieldId: string; header: string }> };
    const sheet = destination({ type: "google_sheets", googleConnectionId: "c1", config });
    google.token.mockResolvedValue("tok");
    // Renamed tab: the first write fails to parse the range, then succeeds under the new name.
    google.writeHeaderRow.mockRejectedValueOnce(new GoogleApiError(400, "", "Unable to parse range: 'Responses'!1:1")).mockResolvedValue(undefined);
    google.sheetTitleById.mockResolvedValue("Renamed");
    expect(await adapterFor("google_sheets").prepare!(sheet, doc)).toEqual({ ok: true });
    expect(google.writeHeaderRow.mock.calls[1][2]).toBe("Renamed");

    google.appendRow.mockResolvedValueOnce(undefined);
    expect(await adapterFor("google_sheets").deliver!(sheet, context)).toEqual({ ok: true });
    expect(google.appendRow.mock.calls[0][3].slice(0, 2)).toEqual(["2026-11-08 10:00:00 UTC", payload.responseId]);

    expect(await adapterFor("google_sheets").test!(sheet)).toEqual({ ok: true });
    google.sheetTitleById.mockResolvedValueOnce(null);
    expect(await adapterFor("google_sheets").test!(sheet)).toMatchObject({ ok: false, message: expect.stringContaining("deleted") });

    google.writeHeaderRow.mockRejectedValueOnce(new GoogleApiError(400, "", "Unable to parse range"));
    google.sheetTitleById.mockResolvedValueOnce(null);
    expect(await adapterFor("google_sheets").prepare!(sheet, doc)).toMatchObject({ ok: false, message: expect.stringContaining("deleted") });

    const incomplete = destination({ type: "google_sheets", config: {} });
    expect(await adapterFor("google_sheets").deliver!(incomplete, context)).toMatchObject({ ok: false, retryable: false });
    expect(await adapterFor("google_sheets").test!(incomplete)).toMatchObject({ ok: false });
  });
});
