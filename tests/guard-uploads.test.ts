import { afterEach, describe, expect, it, vi } from "vitest";

import { createField } from "@/lib/forms/fields";

const dns = vi.hoisted(() => ({ answers: new Map<string, Array<{ address: string; family: number }>>() }));
vi.mock("node:dns", () => ({
  lookup: (host: string, _options: unknown, callback: (error: Error | null, addresses?: unknown) => void) => {
    const found = dns.answers.get(host);
    if (found) callback(null, found);
    else callback(Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" }));
  },
}));
const undici = vi.hoisted(() => ({ fetch: vi.fn(), agentOptions: [] as Array<{ connect: { lookup: (...args: unknown[]) => void } }> }));
vi.mock("undici", () => ({
  Agent: class {
    constructor(options: { connect: { lookup: (...args: unknown[]) => void } }) {
      undici.agentOptions.push(options);
    }
  },
  fetch: (...args: unknown[]) => undici.fetch(...args),
}));

const store = vi.hoisted(() => ({ loadDestinations: vi.fn() }));
vi.mock("@/lib/destinations/store", () => store);
const google = vi.hoisted(() => ({ getFile: vi.fn(), googleAccessToken: vi.fn(), updateFile: vi.fn(), listFolderFiles: vi.fn(), trashFile: vi.fn() }));
vi.mock("@/lib/google/api", async (original) => ({
  ...(await original<typeof import("@/lib/google/api")>()),
  getFile: google.getFile,
  updateFile: google.updateFile,
  listFolderFiles: google.listFolderFiles,
  trashFile: google.trashFile,
}));
const db = vi.hoisted(() => ({ destination: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/google/tokens", () => ({ googleAccessToken: google.googleAccessToken }));

const { assertPublicHttpsUrl, BlockedHostError, guardedFetch, resolvePublicHost } = await import("@/lib/net/guard");
const { cleanOrphanedUploads, driveFileName, extensionOf, filesDestination, finalizeUploads, plannedUploadNames, resolveUploadedFiles } = await import("@/lib/uploads");
const { blankDocument } = await import("@/lib/forms/templates");
const { GoogleAuthError } = await import("@/lib/google/oauth");

afterEach(() => {
  dns.answers.clear();
  vi.clearAllMocks();
});

describe("network guard", () => {
  it("allows public hosts and refuses private or reserved ones", async () => {
    dns.answers.set("hooks.example.org", [{ address: "93.184.216.34", family: 4 }]);
    dns.answers.set("sneaky.example.org", [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    dns.answers.set("empty.example.org", []);
    expect(await resolvePublicHost("hooks.example.org")).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(await resolvePublicHost("8.8.8.8")).toEqual([{ address: "8.8.8.8", family: 4 }]);
    await expect(resolvePublicHost("sneaky.example.org")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(resolvePublicHost("localhost")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(resolvePublicHost("printer.local")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(resolvePublicHost("[::1]")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(resolvePublicHost("169.254.169.254")).rejects.toBeInstanceOf(BlockedHostError);
    await expect(resolvePublicHost("empty.example.org")).rejects.toThrow("No addresses");
    await expect(resolvePublicHost("missing.example.org")).rejects.toThrow("ENOTFOUND");
  });

  it("accepts only plain https links", async () => {
    dns.answers.set("hooks.example.org", [{ address: "93.184.216.34", family: 4 }]);
    expect((await assertPublicHttpsUrl("https://hooks.example.org/in")).hostname).toBe("hooks.example.org");
    await expect(assertPublicHttpsUrl("not a link")).rejects.toThrow("valid link");
    await expect(assertPublicHttpsUrl("http://hooks.example.org")).rejects.toThrow("https://");
    await expect(assertPublicHttpsUrl("https://user:pass@hooks.example.org")).rejects.toThrow("username and password");
    await expect(assertPublicHttpsUrl("https://127.0.0.1/hook")).rejects.toBeInstanceOf(BlockedHostError);
  });

  it("fetches without redirects through a socket that re-checks addresses", async () => {
    dns.answers.set("hooks.example.org", [{ address: "93.184.216.34", family: 4 }]);
    dns.answers.set("rebind.example.org", [{ address: "192.168.1.1", family: 4 }]);
    undici.fetch.mockResolvedValue(new Response("x".repeat(3000), { status: 202 }));
    const response = await guardedFetch("https://hooks.example.org/in", { method: "POST", body: "{}" });
    expect(response).toMatchObject({ status: 202, ok: true });
    expect(await response.text()).toHaveLength(2000);
    expect(undici.fetch.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "manual" });

    // The connect-time lookup refuses private answers (DNS rebinding).
    const lookup = undici.agentOptions[0].connect.lookup;
    const resolved = await new Promise<unknown[]>((resolve) => lookup("hooks.example.org", { all: true }, (...args: unknown[]) => resolve(args)));
    expect(resolved[0]).toBeNull();
    const single = await new Promise<unknown[]>((resolve) => lookup("hooks.example.org", 0, (...args: unknown[]) => resolve(args)));
    expect(single).toEqual([null, "93.184.216.34", 4]);
    const blocked = await new Promise<unknown[]>((resolve) => lookup("rebind.example.org", {}, (...args: unknown[]) => resolve(args)));
    expect(blocked[0]).toBeInstanceOf(BlockedHostError);
  });
});

describe("uploaded files", () => {
  const field = { ...createField("file_upload"), id: "f_cvfield1" };
  const input = (files: Array<{ fileId: string; name: string; size: number }>) => ({ formId: "form-1", responseId: "resp-1", fields: [field], values: { [field.id]: files } as never });
  const meta = (patch: Record<string, unknown> = {}) => ({
    id: "file-1",
    name: "cv.pdf",
    size: "2048",
    mimeType: "application/pdf",
    parents: ["folder-0001"],
    webViewLink: "https://drive.google.com/file/d/file-1/view",
    appProperties: { responseId: "resp-1", fieldId: field.id, formId: "form-1" },
    ...patch,
  });

  it("uploads files under the person's own name, made safe", () => {
    expect(driveFileName("my/cv\u0007 final .pdf")).toBe("my cv final .pdf");
    expect(driveFileName("   ")).toBe("upload");
  });

  it("finds the form's Drive folder", async () => {
    store.loadDestinations.mockResolvedValueOnce([]);
    expect(await filesDestination("form-1")).toBeNull();
    store.loadDestinations.mockResolvedValueOnce([{ googleConnectionId: "c1", config: { nope: true } }]);
    expect(await filesDestination("form-1")).toBeNull();
    store.loadDestinations.mockResolvedValueOnce([{ googleConnectionId: "c1", config: { folderId: "folder-0001", folderUrl: "https://drive.google.com/drive/folders/folder-0001" } }]);
    expect(await filesDestination("form-1")).toEqual({ destinationId: undefined, connectionId: "c1", folderId: "folder-0001", questionFolders: {} });
  });

  it("swaps the browser's claim for Drive's own metadata", async () => {
    store.loadDestinations.mockResolvedValue([{ googleConnectionId: "c1", config: { folderId: "folder-0001", folderUrl: "https://drive.google.com/drive/folders/folder-0001", questionFolders: { [field.id]: "question-folder" } } }]);
    google.googleAccessToken.mockResolvedValue("tok");
    google.getFile.mockResolvedValueOnce(meta({ parents: ["question-folder"] }));
    expect(await resolveUploadedFiles(input([{ fileId: "file-1", name: "cv.pdf", size: 1 }]))).toEqual({
      ok: true,
      values: { [field.id]: [{ name: "cv.pdf", url: "https://drive.google.com/file/d/file-1/view", size: 2048, mimeType: "application/pdf" }] },
    });
  });

  it("rejects files that aren't this response's, and reports Google problems", async () => {
    store.loadDestinations.mockResolvedValue([{ googleConnectionId: "c1", config: { folderId: "folder-0001", folderUrl: "https://drive.google.com/drive/folders/folder-0001" } }]);
    google.googleAccessToken.mockResolvedValue("tok");
    google.getFile.mockResolvedValueOnce(meta({ appProperties: { responseId: "someone-else", fieldId: field.id, formId: "form-1" } }));
    expect(await resolveUploadedFiles(input([{ fileId: "file-1", name: "cv.pdf", size: 1 }]))).toMatchObject({ ok: false, status: 422 });
    google.getFile.mockRejectedValueOnce(new Error("404"));
    expect(await resolveUploadedFiles(input([{ fileId: "gone", name: "cv.pdf", size: 1 }]))).toMatchObject({ ok: false, status: 422 });
    google.googleAccessToken.mockRejectedValueOnce(new GoogleAuthError("revoked", "gone"));
    expect(await resolveUploadedFiles(input([{ fileId: "file-1", name: "cv.pdf", size: 1 }]))).toMatchObject({ ok: false, status: 502, message: expect.stringContaining("Reconnect Google") });
    store.loadDestinations.mockResolvedValueOnce([]);
    expect(await resolveUploadedFiles(input([]))).toEqual({ ok: false, status: 502, message: "File uploads aren't set up for this form." });
  });
});

describe("abandoned uploads", () => {
  const drive = { googleConnectionId: "c1", config: { folderId: "folder-0001", folderUrl: "https://drive.google.com/drive/folders/folder-0001" } };
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-11-20T00:00:00Z");
  const file = (id: string, ageDays: number, appProperties: Record<string, string> | undefined) => ({ id, createdTime: new Date(now - ageDays * day).toISOString(), appProperties });

  it("renames and marks a sent response's files, and never throws", async () => {
    await finalizeUploads("form-1", []);
    expect(store.loadDestinations).not.toHaveBeenCalled();
    store.loadDestinations.mockResolvedValueOnce([drive]);
    google.googleAccessToken.mockResolvedValueOnce("tok");
    google.updateFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("gone"));
    await finalizeUploads("form-1", [
      { fileId: "file-a", name: "Lina_1.pdf" },
      { fileId: "file-b", name: null },
    ]);
    expect(google.updateFile).toHaveBeenCalledWith("tok", "file-a", { name: "Lina_1.pdf", appProperties: { submitted: "1" } });
    expect(google.updateFile).toHaveBeenCalledWith("tok", "file-b", { appProperties: { submitted: "1" } });
    store.loadDestinations.mockResolvedValueOnce([]);
    await finalizeUploads("form-1", [{ fileId: "file-a", name: null }]);
    store.loadDestinations.mockResolvedValueOnce([drive]);
    google.googleAccessToken.mockRejectedValueOnce(new Error("revoked"));
    await expect(finalizeUploads("form-1", [{ fileId: "file-a", name: null }])).resolves.toBeUndefined();
  });

  it("trashes only our week-old files that never became part of a response", async () => {
    db.destination.findMany.mockResolvedValueOnce([
      { id: "d1", formId: "form-1", ...drive },
      { id: "d2", formId: "form-2", googleConnectionId: "c2", config: { broken: true } },
      { id: "d3", formId: "form-3", googleConnectionId: "c3", config: drive.config },
    ]);
    google.googleAccessToken.mockImplementation(async (connectionId: string) => {
      if (connectionId === "c3") throw new Error("revoked");
      return "tok";
    });
    google.listFolderFiles
      .mockResolvedValueOnce({
        files: [file("old-orphan", 9, { aiesecForms: "1" }), file("sent", 9, { aiesecForms: "1", submitted: "1" }), file("recent", 2, { aiesecForms: "1" })],
        nextPageToken: "p2",
      })
      .mockResolvedValueOnce({ files: [file("owner-file", 30, undefined), file("old-orphan-2", 8, { aiesecForms: "1" })] });
    google.trashFile.mockResolvedValue(undefined);
    expect(await cleanOrphanedUploads(now)).toEqual({ folders: 2, trashed: 2, failedFolders: 1 });
    expect(google.trashFile.mock.calls.map((call) => call[1])).toEqual(["old-orphan", "old-orphan-2"]);
  });
});

describe("upload naming", () => {
  const name = { ...createField("short_text"), id: "f_name0001", label: "Full name" };
  const lc = { ...createField("dropdown"), id: "f_lc000001", label: "LC", options: [{ id: "o_beirut1", label: "Beirut" }] };
  const notes = { ...createField("statement"), id: "f_note0001" };
  const cv = { ...createField("file_upload"), id: "f_cv000001", maxFiles: 3 };
  const docWith = (naming: unknown, fields: unknown[] = [name, lc, notes, cv]) => {
    const doc = blankDocument("Recruitment");
    doc.pages[0].fields = fields.map((field) => (field === cv ? { ...cv, naming } : field)) as never;
    return doc;
  };
  const files = [
    { fileId: "file-a", name: "My CV.PDF", size: 1 },
    { fileId: "file-b", name: "portfolio", size: 1 },
  ];

  it("keeps original names when no format is set", () => {
    expect(plannedUploadNames(docWith(null), { [name.id]: "Lina", [cv.id]: files as never })).toEqual([
      { fileId: "file-a", name: null },
      { fileId: "file-b", name: null },
    ]);
  });

  it("builds names from earlier answers, a separator and a number", () => {
    const values = { [name.id]: "Lina / Haddad", [lc.id]: { optionIds: ["o_beirut1"], other: null }, [cv.id]: files as never };
    expect(plannedUploadNames(docWith({ fieldIds: [name.id, lc.id], separator: "_", index: true }), values)).toEqual([
      { fileId: "file-a", name: "Lina Haddad_Beirut_1.pdf" },
      { fileId: "file-b", name: "Lina Haddad_Beirut_2" },
    ]);
    expect(plannedUploadNames(docWith({ fieldIds: [name.id], separator: "-", index: false }), values)[0]).toEqual({ fileId: "file-a", name: "Lina Haddad.pdf" });
  });

  it("skips empty, missing and non-answer questions, and falls back to the original name", () => {
    const naming = { fieldIds: [name.id, "f_deleted1", notes.id, cv.id, lc.id], separator: " ", index: true };
    expect(plannedUploadNames(docWith(naming), { [name.id]: null, [lc.id]: { optionIds: ["o_beirut1"], other: null }, [cv.id]: files as never })[0]).toEqual({ fileId: "file-a", name: "Beirut 1.pdf" });
    expect(plannedUploadNames(docWith({ fieldIds: [name.id], separator: "_", index: true }), { [cv.id]: files as never })[0]).toEqual({ fileId: "file-a", name: null });
    expect(plannedUploadNames(docWith({ fieldIds: [name.id], separator: "_", index: true }), { [cv.id]: null })).toEqual([]);
  });

  it("reads extensions conservatively", () => {
    expect(extensionOf("cv.final.PDF")).toBe(".pdf");
    expect(extensionOf("archive.tar.gz ")).toBe(".gz");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf("weird.not-an-ext")).toBe("");
  });
});
