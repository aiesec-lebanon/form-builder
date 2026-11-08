import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/lib/env";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  recordAudit: vi.fn(),
  rateLimit: vi.fn(),
  googleAccessToken: vi.fn(),
  placeRootFolder: vi.fn(),
  db: { googleConnection: { findFirst: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }));
vi.mock("@/lib/google/tokens", () => ({ googleAccessToken: m.googleAccessToken }));
vi.mock("@/lib/google/folders", () => ({ placeRootFolder: m.placeRootFolder }));
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { googlePickerSession, setGoogleFolderLocation } = await import("@/actions/google");
const { GoogleAuthError } = await import("@/lib/google/oauth");

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
    m.placeRootFolder.mockResolvedValueOnce({ ok: true, rootId: "root-1", parentName: "LC Beirut" });
    expect(await setGoogleFolderLocation("c1", FOLDER)).toEqual({ ok: true, data: { rootFolderId: "root-1", parentName: "LC Beirut" } });
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
