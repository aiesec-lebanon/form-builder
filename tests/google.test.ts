import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encryptSecret } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";
import {
  a1,
  addSheetTab,
  appendRow,
  createFolder,
  createSpreadsheet,
  getFile,
  getSpreadsheet,
  GoogleApiError,
  driveLiteral,
  findFolder,
  formatSheet,
  headerWidth,
  listFolderFiles,
  moveToFolder,
  sheetTitleById,
  updateFile,
  trashFile,
  uniqueTabTitle,
  startResumableUpload,
  writeHeaderRow,
} from "@/lib/google/api";
import { exchangeGoogleCode, GoogleAuthError, googleAuthorizeUrl, googleCookieOptions, refreshGoogleToken } from "@/lib/google/oauth";

const db = vi.hoisted(() => ({ googleConnection: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
const { googleAccessToken } = await import("@/lib/google/tokens");

type Call = [string, RequestInit];
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
function stubFetch(...responses: Array<Response | Error>) {
  const mock = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? json({});
  });
  vi.stubGlobal("fetch", mock);
  return mock as unknown as { mock: { calls: Call[] } };
}
const idToken = (claims: Record<string, unknown>) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  resetEnvCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetEnvCache();
});

describe("Google OAuth", () => {
  it("asks for offline drive.file access", () => {
    const url = new URL(googleAuthorizeUrl("state-1", { loginHint: "lina@aiesec.net", hostedDomain: "aiesec.net" }));
    expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/drive.file");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/google/callback");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("login_hint")).toBe("lina@aiesec.net");
    expect(url.searchParams.get("hd")).toBe("aiesec.net");
    const bare = new URL(googleAuthorizeUrl("s")).searchParams;
    expect(bare.has("login_hint") || bare.has("hd")).toBe(false);
    expect(googleCookieOptions()).toMatchObject({ path: "/api/google", maxAge: 600, httpOnly: true });
  });

  it("exchanges a code for tokens and the account identity", async () => {
    const fetchMock = stubFetch(json({ access_token: "at", expires_in: 3600, refresh_token: "rt", scope: "openid email https://www.googleapis.com/auth/drive.file", id_token: idToken({ sub: "123", email: "Lina@Example.org" }) }));
    const grant = await exchangeGoogleCode("code-1");
    expect(grant).toMatchObject({ accessToken: "at", refreshToken: "rt", sub: "123", email: "lina@example.org", emailVerified: true, hostedDomain: null });
    stubFetch(json({ access_token: "at", expires_in: 3600, refresh_token: "rt", scope: "openid email https://www.googleapis.com/auth/drive.file", id_token: idToken({ sub: "124", email: "lina@aiesec.net", hd: "AIESEC.net" }) }));
    expect((await exchangeGoogleCode("code-2")).hostedDomain).toBe("aiesec.net");
    expect(String(fetchMock.mock.calls[0][1].body)).toContain("client_secret=client-secret");
  });

  it("refuses grants without identity, refresh token or Drive access", async () => {
    const base = { access_token: "at", refresh_token: "rt", scope: "drive.file", id_token: idToken({ sub: "1", email: "a@b.c" }) };
    stubFetch(json({ ...base, id_token: undefined }));
    await expect(exchangeGoogleCode("c")).rejects.toThrow("identity");
    stubFetch(json({ ...base, id_token: "garbage" }));
    await expect(exchangeGoogleCode("c")).rejects.toThrow("identity");
    stubFetch(json({ ...base, refresh_token: undefined }));
    await expect(exchangeGoogleCode("c")).rejects.toThrow("refresh token");
    stubFetch(json({ ...base, scope: "openid email" }));
    await expect(exchangeGoogleCode("c")).rejects.toThrow("Drive access");
  });

  it("classifies token endpoint failures", async () => {
    stubFetch(json({ error: "invalid_grant" }, 400));
    await expect(refreshGoogleToken("rt")).rejects.toMatchObject({ kind: "revoked" });
    stubFetch(json({ error: "server" }, 503));
    await expect(refreshGoogleToken("rt")).rejects.toMatchObject({ kind: "unavailable" });
    stubFetch(json({ error: "bad" }, 401));
    await expect(refreshGoogleToken("rt")).rejects.toMatchObject({ kind: "invalid" });
    stubFetch(new TypeError("fetch failed"));
    await expect(refreshGoogleToken("rt")).rejects.toMatchObject({ kind: "unavailable" });
    stubFetch(json({ unexpected: true }));
    await expect(refreshGoogleToken("rt")).rejects.toMatchObject({ kind: "unavailable" });
    stubFetch(json({ access_token: "new", expires_in: 60 }));
    expect(await refreshGoogleToken("rt")).toMatchObject({ accessToken: "new" });
  });

  it("needs the client configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    resetEnvCache();
    await expect(refreshGoogleToken("rt")).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("Google access tokens", () => {
  const connection = (patch: Record<string, unknown> = {}) => ({
    id: "c1",
    status: "active",
    refreshTokenEnc: encryptSecret("refresh-1"),
    accessTokenEnc: null as string | null,
    accessTokenExpiresAt: null as Date | null,
    ...patch,
  });

  it("reuses a cached token until shortly before it expires", async () => {
    db.googleConnection.findUnique.mockResolvedValue(connection({ accessTokenEnc: encryptSecret("cached"), accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000) }));
    const fetchMock = stubFetch();
    expect(await googleAccessToken("c1")).toBe("cached");
    expect(fetchMock.mock.calls).toHaveLength(0);
  });

  it("refreshes and stores an expired token", async () => {
    db.googleConnection.findUnique.mockResolvedValue(connection({ accessTokenEnc: "unreadable", accessTokenExpiresAt: new Date(Date.now() + 10 * 60_000) }));
    stubFetch(json({ access_token: "fresh", expires_in: 3600 }));
    expect(await googleAccessToken("c1")).toBe("fresh");
    expect(db.googleConnection.update.mock.calls[0][0].data.accessTokenEnc).not.toContain("fresh");
  });

  it("marks revoked connections and refuses unusable ones", async () => {
    db.googleConnection.findUnique.mockResolvedValueOnce(null);
    await expect(googleAccessToken("c1")).rejects.toMatchObject({ kind: "revoked" });
    db.googleConnection.findUnique.mockResolvedValueOnce(connection({ status: "revoked" }));
    await expect(googleAccessToken("c1")).rejects.toMatchObject({ kind: "revoked" });
    db.googleConnection.findUnique.mockResolvedValueOnce(connection({ refreshTokenEnc: "garbage" }));
    await expect(googleAccessToken("c1")).rejects.toThrow("unreadable");
    db.googleConnection.findUnique.mockResolvedValueOnce(connection());
    stubFetch(json({ error: "invalid_grant" }, 400));
    await expect(googleAccessToken("c1")).rejects.toBeInstanceOf(GoogleAuthError);
    expect(db.googleConnection.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "revoked", accessTokenEnc: null, accessTokenExpiresAt: null } });
  });
});

describe("Drive folders and Sheet formatting", () => {
  it("finds, creates and moves into folders", async () => {
    const fetchMock = stubFetch(json({ files: [{ id: "f1" }] }), json({ files: [] }), json({ id: "new", webViewLink: "https://drive/new" }), json({ id: "s1", parents: ["root-id"] }), json({ id: "s1" }), json({ id: "s2", parents: ["dest"] }), json({ id: "s2" }));
    expect(await findFolder("tok", "Lina's form", "root")).toEqual({ id: "f1" });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("q")).toBe("name = 'Lina\\'s form' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false");
    expect(await findFolder("tok", "Missing", "root")).toBeNull();
    await createFolderCall();
    async function createFolderCall() {
      const { createFolder } = await import("@/lib/google/api");
      expect(await createFolder("tok", "Uploads", "parent-1")).toEqual({ id: "new", webViewLink: "https://drive/new" });
      expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toMatchObject({ name: "Uploads", parents: ["parent-1"] });
    }
    await moveToFolder("tok", "s1", "dest");
    const move = new URL(fetchMock.mock.calls[4][0]);
    expect(move.searchParams.get("addParents")).toBe("dest");
    expect(move.searchParams.get("removeParents")).toBe("root-id");
    await moveToFolder("tok", "s2", "dest");
    expect(new URL(fetchMock.mock.calls[6][0]).searchParams.has("removeParents")).toBe(false);
    expect(driveLiteral("a\\b")).toBe("'a\\\\b'");
  });

  it("bolds only the header and sizes columns to their headers", async () => {
    const fetchMock = stubFetch(json({}));
    await formatSheet("tok", "s1", 7, ["Submitted at", "Which committee are you in right now?"]);
    const requests = JSON.parse(String(fetchMock.mock.calls[0][1].body)).requests;
    expect(requests[0].repeatCell).toMatchObject({ range: { sheetId: 7, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } } });
    expect(requests[1].repeatCell).toMatchObject({ range: { sheetId: 7, startRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: false } } } });
    expect(requests.slice(3).map((request: { updateDimensionProperties: { properties: { pixelSize: number } } }) => request.updateDimensionProperties.properties.pixelSize)).toEqual([headerWidth("Submitted at"), headerWidth("Which committee are you in right now?")]);
    expect(headerWidth("ID")).toBe(100);
    expect(headerWidth("x".repeat(200))).toBe(360);
  });
});

describe("Drive cleanup calls", () => {
  it("lists a folder's files and moves files to the trash", async () => {
    const fetchMock = stubFetch(json({ files: [{ id: "a", createdTime: "2026-11-01T00:00:00Z" }], nextPageToken: "next" }), json({ files: [] }), json({ id: "a" }));
    expect(await listFolderFiles("tok", "folder'0001")).toEqual({ files: [{ id: "a", createdTime: "2026-11-01T00:00:00Z" }], nextPageToken: "next" });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("q")).toBe("'folder\\'0001' in parents and trashed = false");
    await listFolderFiles("tok", "folder-0001", "next");
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("pageToken")).toBe("next");
    await trashFile("tok", "a");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1].body))).toEqual({ trashed: true });
  });
});

describe("Sheets and Drive client", () => {
  it("quotes tab names in A1 ranges", () => {
    expect(a1("Lina's tab", "A1")).toBe("'Lina''s tab'!A1");
  });

  it("creates a spreadsheet with a bold header row", async () => {
    const fetchMock = stubFetch(json({ spreadsheetId: "s1", spreadsheetUrl: "https://docs/s1", sheets: [{ properties: { sheetId: 7, title: "Responses" } }] }));
    expect(await createSpreadsheet("tok", "Form", ["Submitted at", "Name"])).toEqual({ spreadsheetId: "s1", spreadsheetUrl: "https://docs/s1", sheetId: 7, sheetTitle: "Responses" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://sheets.googleapis.com/v4/spreadsheets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body)).sheets[0].data[0].rowData[0].values[1].userEnteredValue.stringValue).toBe("Name");
  });

  it("writes headers and appends rows as raw values", async () => {
    const fetchMock = stubFetch(json({}), json({}));
    await writeHeaderRow("tok", "s1", "Responses", ["A"]);
    await appendRow("tok", "s1", "Responses", ["=SUM(A1)", 2, true]);
    expect(fetchMock.mock.calls[0][0]).toContain("valueInputOption=RAW");
    expect(fetchMock.mock.calls[1][0]).toContain(":append?valueInputOption=RAW&insertDataOption=OVERWRITE");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({ values: [["=SUM(A1)", 2, true]] });
  });

  it("finds a tab by id and works with Drive files", async () => {
    stubFetch(
      json({ sheets: [{ properties: { sheetId: 1, title: "Old" } }, { properties: { sheetId: 7, title: "Renamed" } }] }),
      json({ sheets: [] }),
      json({ id: "folder", webViewLink: "https://drive/folder" }),
      json({ id: "file", name: "cv.pdf", mimeType: "application/pdf" }),
      new Response(null, { status: 204 }),
    );
    expect(await sheetTitleById("tok", "s1", 7)).toBe("Renamed");
    expect(await sheetTitleById("tok", "s1", 7)).toBeNull();
    expect(await createFolder("tok", "Uploads")).toEqual({ id: "folder", webViewLink: "https://drive/folder" });
    expect(await getFile("tok", "file")).toMatchObject({ name: "cv.pdf" });
    await expect(updateFile("tok", "file", { name: "Lina_1.pdf", appProperties: { submitted: "1" } })).resolves.toBeUndefined();
    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(String(url)).toContain("/files/file?");
    expect(init).toMatchObject({ method: "PATCH", body: JSON.stringify({ name: "Lina_1.pdf", appProperties: { submitted: "1" } }) });
  });

  it("raises readable errors and knows which to retry", async () => {
    stubFetch(json({ error: { message: "Rate limit", status: "RESOURCE_EXHAUSTED", errors: [{ reason: "rateLimitExceeded" }] } }, 429));
    const error = await getFile("tok", "f").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GoogleApiError);
    expect(error).toMatchObject({ status: 429, reason: "rateLimitExceeded", message: "Rate limit", retryable: true });
    stubFetch(new Response("not json", { status: 404 }));
    await expect(getFile("tok", "f")).rejects.toMatchObject({ status: 404, retryable: false, message: "Google responded 404" });
  });

  it("starts resumable uploads with the size and origin declared", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 200, headers: { location: "https://upload/session" } }));
    const input = { folderId: "folder", name: "cv.pdf", mimeType: "", size: 1234, origin: "http://localhost:3000", appProperties: { formId: "f1" } };
    expect(await startResumableUpload("tok", input)).toBe("https://upload/session");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Upload-Content-Length"]).toBe("1234");
    expect(headers["X-Upload-Content-Type"]).toBe("application/octet-stream");
    stubFetch(json({ error: { message: "Storage full", errors: [{ reason: "storageQuotaExceeded" }] } }, 403));
    await expect(startResumableUpload("tok", input)).rejects.toMatchObject({ status: 403, reason: "storageQuotaExceeded" });
    stubFetch(new Response(null, { status: 200 }));
    await expect(startResumableUpload("tok", input)).rejects.toThrow("didn't start the upload");
  });
});

describe("existing Sheets", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads a picked spreadsheet and adds a tab to it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ spreadsheetId: "s1", spreadsheetUrl: "https://docs/s1/edit", properties: { title: "LC data" }, sheets: [{ properties: { sheetId: 0, title: "Members" } }] }))
      .mockResolvedValueOnce(Response.json({ spreadsheetId: "s2", spreadsheetUrl: "https://docs/s2/edit", properties: { title: "Empty" } }))
      .mockResolvedValueOnce(Response.json({ replies: [{ addSheet: { properties: { sheetId: 42, title: "Recruitment Responses" } } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getSpreadsheet("tok", "s1")).toEqual({ spreadsheetId: "s1", spreadsheetUrl: "https://docs/s1/edit", title: "LC data", sheets: [{ sheetId: 0, title: "Members" }] });
    expect((await getSpreadsheet("tok", "s2")).sheets).toEqual([]);
    expect(await addSheetTab("tok", "s1", "Recruitment Responses")).toEqual({ sheetId: 42, title: "Recruitment Responses" });
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toContain("/s1:batchUpdate");
    expect(JSON.parse(String(init.body)).requests[0].addSheet.properties).toEqual({ title: "Recruitment Responses", gridProperties: { frozenRowCount: 1 } });
  });

  it("picks a tab title that isn't taken", () => {
    expect(uniqueTabTitle("Recruitment Responses", ["Members"])).toBe("Recruitment Responses");
    expect(uniqueTabTitle("Recruitment Responses", ["recruitment responses", "Recruitment Responses (2)"])).toBe("Recruitment Responses (3)");
    expect(uniqueTabTitle("  \u0007 ", [])).toBe("Responses");
    expect(uniqueTabTitle("x".repeat(120), []).length).toBe(90);
  });
});
