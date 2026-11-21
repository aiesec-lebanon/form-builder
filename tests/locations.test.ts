import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ inspectFile: vi.fn() }));
vi.mock("@/lib/google/api", async (original) => ({ ...(await original<typeof import("@/lib/google/api")>()), inspectFile: m.inspectFile }));

const { checkLocation } = await import("@/lib/google/locations");
const { FOLDER_MIME, GoogleApiError, SPREADSHEET_MIME } = await import("@/lib/google/api");

const folder = (extra: Record<string, unknown> = {}) => ({ id: "folder-0001", name: "Recruitment 2026", mimeType: FOLDER_MIME, webViewLink: "https://drive.google.com/drive/folders/folder-0001", capabilities: { canAddChildren: true }, ...extra });
const sheet = (extra: Record<string, unknown> = {}) => ({ id: "sheet-0001", name: "LC data", mimeType: SPREADSHEET_MIME, webViewLink: "https://docs.google.com/spreadsheets/d/sheet-0001/edit", capabilities: { canEdit: true }, ...extra });

afterEach(() => vi.clearAllMocks());

describe("a folder the owner chose", () => {
  it("is ready when the account can add files there, in My Drive or a shared drive", async () => {
    m.inspectFile.mockResolvedValueOnce(folder());
    expect(await checkLocation("tok", "folder-0001", "folder")).toEqual({
      ok: true,
      location: { id: "folder-0001", name: "Recruitment 2026", url: "https://drive.google.com/drive/folders/folder-0001", sharedDrive: false },
    });
    expect(m.inspectFile).toHaveBeenCalledWith("tok", "folder-0001");
    m.inspectFile.mockResolvedValueOnce(folder({ driveId: "0AbCdEfGhIjKlUk9PVA", webViewLink: undefined }));
    expect(await checkLocation("tok", "folder-0001", "folder")).toMatchObject({ ok: true, location: { sharedDrive: true, url: "https://drive.google.com/drive/folders/folder-0001" } });
  });

  it("needs confirming in Google's chooser when AIESEC Forms can't open it yet", async () => {
    m.inspectFile.mockRejectedValueOnce(new GoogleApiError(404, "notFound", "File not found: folder-0001."));
    expect(await checkLocation("tok", "folder-0001", "folder")).toEqual({ ok: false, needsAccess: true });
    m.inspectFile.mockRejectedValueOnce(new GoogleApiError(403, "appNotAuthorizedToFile", "The user has not granted the app access to the file."));
    expect(await checkLocation("tok", "folder-0001", "folder")).toEqual({ ok: false, needsAccess: true });
  });

  it("passes other Google failures on", async () => {
    m.inspectFile.mockRejectedValueOnce(new GoogleApiError(403, "userRateLimitExceeded", "Slow down"));
    await expect(checkLocation("tok", "folder-0001", "folder")).rejects.toThrow("Slow down");
    m.inspectFile.mockRejectedValueOnce(new Error("network"));
    await expect(checkLocation("tok", "folder-0001", "folder")).rejects.toThrow("network");
  });

  it("explains files, the trash and view-only access", async () => {
    m.inspectFile.mockResolvedValueOnce(sheet());
    expect(await checkLocation("tok", "x", "folder")).toMatchObject({ ok: false, needsAccess: false, message: expect.stringContaining("That's a Sheet") });
    m.inspectFile.mockResolvedValueOnce(folder({ mimeType: "application/pdf" }));
    expect(await checkLocation("tok", "x", "folder")).toMatchObject({ ok: false, message: expect.stringContaining("That's a file") });
    m.inspectFile.mockResolvedValueOnce(folder({ trashed: true }));
    expect(await checkLocation("tok", "x", "folder")).toMatchObject({ ok: false, message: expect.stringContaining("trash") });
    m.inspectFile.mockResolvedValueOnce(folder({ capabilities: { canAddChildren: false } }));
    expect(await checkLocation("tok", "x", "folder")).toMatchObject({ ok: false, message: expect.stringContaining("Ask its owner") });
    // Shared drives: Viewers and Commenters can't add files.
    m.inspectFile.mockResolvedValueOnce(folder({ driveId: "0AbCdEfGhIjKlUk9PVA", capabilities: { canAddChildren: false } }));
    expect(await checkLocation("tok", "x", "folder")).toMatchObject({ ok: false, message: expect.stringContaining("Contributor") });
  });
});

describe("a Sheet the owner chose", () => {
  it("is ready when it's a Google Sheet the account can edit", async () => {
    m.inspectFile.mockResolvedValueOnce(sheet({ driveId: "0AbCdEfGhIjKlUk9PVA" }));
    expect(await checkLocation("tok", "sheet-0001", "spreadsheet")).toEqual({
      ok: true,
      location: { id: "sheet-0001", name: "LC data", url: "https://docs.google.com/spreadsheets/d/sheet-0001/edit", sharedDrive: true },
    });
    m.inspectFile.mockResolvedValueOnce(sheet({ webViewLink: undefined, capabilities: undefined }));
    expect(await checkLocation("tok", "sheet-0001", "spreadsheet")).toMatchObject({ ok: true, location: { url: "https://docs.google.com/spreadsheets/d/sheet-0001/edit" } });
  });

  it("explains Excel files, folders, other files, the trash and view-only Sheets", async () => {
    m.inspectFile.mockResolvedValueOnce(sheet({ mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    expect(await checkLocation("tok", "x", "spreadsheet")).toMatchObject({ ok: false, message: expect.stringContaining("Save as Google Sheets") });
    m.inspectFile.mockResolvedValueOnce(folder());
    expect(await checkLocation("tok", "x", "spreadsheet")).toMatchObject({ ok: false, message: expect.stringContaining("That's a folder") });
    m.inspectFile.mockResolvedValueOnce(sheet({ mimeType: "application/vnd.google-apps.document" }));
    expect(await checkLocation("tok", "x", "spreadsheet")).toMatchObject({ ok: false, message: expect.stringContaining("isn't a Google Sheet") });
    m.inspectFile.mockResolvedValueOnce(sheet({ trashed: true }));
    expect(await checkLocation("tok", "x", "spreadsheet")).toMatchObject({ ok: false, message: expect.stringContaining("trash") });
    m.inspectFile.mockResolvedValueOnce(sheet({ capabilities: { canEdit: false } }));
    expect(await checkLocation("tok", "x", "spreadsheet")).toMatchObject({ ok: false, message: expect.stringContaining("only view") });
  });
});
