import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/lib/env";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  recordAudit: vi.fn(),
  rateLimit: vi.fn(),
  googleAccessToken: vi.fn(),
  placeRootFolder: vi.fn(),
  checkLocation: vi.fn(),
  db: { googleConnection: { findFirst: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }));
vi.mock("@/lib/google/tokens", () => ({ googleAccessToken: m.googleAccessToken }));
vi.mock("@/lib/google/folders", () => ({ placeRootFolder: m.placeRootFolder }));
vi.mock("@/lib/google/locations", () => ({ checkLocation: m.checkLocation }));
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { checkGoogleLocation, googlePickerSession, setGoogleFolderLocation } = await import("@/actions/google");
const { GoogleAuthError } = await import("@/lib/google/oauth");
const { GoogleApiError } = await import("@/lib/google/api");

const FOLDER = "folder-picked-0001";

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_API_KEY", "browser-key");
  vi.stubEnv("GOOGLE_PROJECT_NUMBER", "123456789012");
  resetEnvCache();
  m.getCurrentUser.mockResolvedValue({ id: "u1" });
  m.db.googleConnection.findFirst.mockResolvedValue({ id: "c1" });
  m.rateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
  m.googleAccessToken.mockResolvedValue("tok");
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
  vi.clearAllMocks();
});

describe("Google Picker session", () => {
  it("gives the owner's browser a token for their own account", async () => {
    expect(await googlePickerSession("c1")).toEqual({ ok: true, data: { token: "tok", apiKey: "browser-key", appId: "123456789012" } });
    expect(m.db.googleConnection.findFirst).toHaveBeenCalledWith({ where: { id: "c1", userId: "u1", status: "active" }, select: { id: true } });
  });

  it("refuses when signed out, not set up, not theirs, too fast or Google is gone", async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await googlePickerSession("c1")).toMatchObject({ ok: false, error: expect.stringContaining("Sign in") });
    m.db.googleConnection.findFirst.mockResolvedValueOnce(null);
    expect(await googlePickerSession("c2")).toMatchObject({ ok: false, error: "Connect your Google account first." });
    m.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect(await googlePickerSession("c1")).toMatchObject({ ok: false, error: expect.stringContaining("Too many") });
    m.googleAccessToken.mockRejectedValueOnce(new GoogleAuthError("revoked", "gone"));
    expect(await googlePickerSession("c1")).toMatchObject({ ok: false, error: expect.stringContaining("Reconnect Google") });
    m.googleAccessToken.mockRejectedValueOnce(new Error("network"));
    expect(await googlePickerSession("c1")).toMatchObject({ ok: false });
    vi.stubEnv("GOOGLE_PROJECT_NUMBER", "not-a-number");
    resetEnvCache();
    expect(await googlePickerSession("c1")).toMatchObject({ ok: false, error: expect.stringContaining("isn't set up") });
  });
});

describe("AIESEC Forms location", () => {
  it("moves the folder into the picked one and records it", async () => {
    m.placeRootFolder.mockResolvedValueOnce({ ok: true, rootId: "root-1", parentName: "LC Beirut", moved: false, sharedDrive: true });
    expect(await setGoogleFolderLocation("c1", FOLDER)).toEqual({ ok: true, data: { rootFolderId: "root-1", parentName: "LC Beirut", moved: false, sharedDrive: true } });
    expect(m.placeRootFolder).toHaveBeenCalledWith("tok", "c1", FOLDER);
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "google.folder_moved", actorId: "u1" }));
  });

  it("explains what went wrong", async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await setGoogleFolderLocation("c1", FOLDER)).toMatchObject({ ok: false });
    expect(await setGoogleFolderLocation("c1", "bad id!")).toMatchObject({ ok: false, error: "Choose the folder again." });
    m.db.googleConnection.findFirst.mockResolvedValueOnce(null);
    expect(await setGoogleFolderLocation("c1", FOLDER)).toMatchObject({ ok: false, error: "Connect your Google account first." });
    m.placeRootFolder.mockResolvedValueOnce({ ok: false, message: "Choose a folder, not a file." });
    expect(await setGoogleFolderLocation("c1", FOLDER)).toEqual({ ok: false, error: "Choose a folder, not a file." });
    m.placeRootFolder.mockRejectedValueOnce(new Error("boom"));
    expect(await setGoogleFolderLocation("c1", FOLDER)).toMatchObject({ ok: false });
    expect(m.recordAudit).not.toHaveBeenCalled();
  });
});

describe("a folder or Sheet link the owner pasted", () => {
  const FOLDER_ID = "0AbCdEfGhIjKlUk9PVA";
  const SHEET_ID = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
  const location = { id: FOLDER_ID, name: "AIESEC in Lebanon", url: `https://drive.google.com/drive/folders/${FOLDER_ID}`, sharedDrive: true };

  it("checks the linked folder with Google, shared drives included", async () => {
    m.checkLocation.mockResolvedValueOnce({ ok: true, location });
    expect(await checkGoogleLocation("c1", { link: `https://drive.google.com/drive/u/0/folders/${FOLDER_ID}?usp=sharing`, kind: "folder" })).toEqual({ ok: true, data: { status: "ready", location } });
    expect(m.checkLocation).toHaveBeenCalledWith("tok", FOLDER_ID, "folder");
    expect(m.rateLimit).toHaveBeenCalledWith("google-location:u1", 30, 60);
  });

  it("asks for confirmation in Google's chooser when AIESEC Forms can't open it yet", async () => {
    m.checkLocation.mockResolvedValueOnce({ ok: false, needsAccess: true });
    expect(await checkGoogleLocation("c1", { link: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`, kind: "spreadsheet" })).toEqual({ ok: true, data: { status: "needs_access", fileId: SHEET_ID } });
    expect(m.checkLocation).toHaveBeenCalledWith("tok", SHEET_ID, "spreadsheet");
  });

  it("refuses links that can't be what's being chosen, before asking Google", async () => {
    expect(await checkGoogleLocation("c1", { link: "https://example.org/folder", kind: "folder" })).toMatchObject({ ok: false, error: expect.stringContaining("Google Drive folder") });
    expect(await checkGoogleLocation("c1", { link: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`, kind: "folder" })).toMatchObject({ ok: false, error: expect.stringContaining("link to a Sheet") });
    expect(await checkGoogleLocation("c1", { link: `https://drive.google.com/drive/folders/${FOLDER_ID}`, kind: "spreadsheet" })).toMatchObject({ ok: false, error: expect.stringContaining("link to a folder") });
    // Whatever the browser sends.
    expect(await checkGoogleLocation("c1", { link: 42, kind: "folder" } as never)).toMatchObject({ ok: false });
    expect(await checkGoogleLocation("c1", null as never)).toMatchObject({ ok: false });
    expect(m.checkLocation).not.toHaveBeenCalled();
  });

  it("explains what went wrong", async () => {
    const link = `https://drive.google.com/drive/folders/${FOLDER_ID}`;
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await checkGoogleLocation("c1", { link, kind: "folder" })).toMatchObject({ ok: false, error: expect.stringContaining("Sign in") });
    m.db.googleConnection.findFirst.mockResolvedValueOnce(null);
    expect(await checkGoogleLocation("c2", { link, kind: "folder" })).toMatchObject({ ok: false, error: "Connect your Google account first." });
    m.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect(await checkGoogleLocation("c1", { link, kind: "folder" })).toMatchObject({ ok: false, error: expect.stringContaining("Too many") });
    m.checkLocation.mockResolvedValueOnce({ ok: false, needsAccess: false, message: "You can only view that shared drive folder." });
    expect(await checkGoogleLocation("c1", { link, kind: "folder" })).toEqual({ ok: false, error: "You can only view that shared drive folder." });
    m.checkLocation.mockRejectedValueOnce(new GoogleApiError(500, "", "busy"));
    expect(await checkGoogleLocation("c1", { link, kind: "folder" })).toMatchObject({ ok: false, error: expect.stringContaining("busy") });
    m.googleAccessToken.mockRejectedValueOnce(new GoogleAuthError("revoked", "gone"));
    expect(await checkGoogleLocation("c1", { link, kind: "folder" })).toMatchObject({ ok: false, error: expect.stringContaining("Reconnect Google") });
  });
});
