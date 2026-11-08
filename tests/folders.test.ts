import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getFile: vi.fn(),
  findFolder: vi.fn(),
  createFolder: vi.fn(),
  db: {
    googleConnection: { findUnique: vi.fn(), update: vi.fn() },
    destination: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/google/api", () => ({ getFile: m.getFile, findFolder: m.findFolder, createFolder: m.createFolder }));
vi.mock("@/lib/db", () => ({ db: m.db }));

const { ensureFormFolder, ensureQuestionFolder, ensureRootFolder, folderNotice, ROOT_FOLDER_NAME } = await import("@/lib/google/folders");

afterEach(() => vi.clearAllMocks());

describe("AIESEC Forms folder", () => {
  it("reuses the saved folder while it exists", async () => {
    m.db.googleConnection.findUnique.mockResolvedValueOnce({ rootFolderId: "root-1" });
    m.getFile.mockResolvedValueOnce({ id: "root-1", trashed: false });
    expect(await ensureRootFolder("tok", "c1")).toBe("root-1");
    expect(m.createFolder).not.toHaveBeenCalled();
  });

  it("finds or creates it again when it was trashed or never saved", async () => {
    m.db.googleConnection.findUnique.mockResolvedValueOnce({ rootFolderId: "root-1" });
    m.getFile.mockResolvedValueOnce({ id: "root-1", trashed: true });
    m.findFolder.mockResolvedValueOnce({ id: "root-found" });
    expect(await ensureRootFolder("tok", "c1")).toBe("root-found");
    expect(m.findFolder).toHaveBeenCalledWith("tok", ROOT_FOLDER_NAME, "root");

    m.db.googleConnection.findUnique.mockResolvedValueOnce({ rootFolderId: null });
    m.findFolder.mockResolvedValueOnce(null);
    m.createFolder.mockResolvedValueOnce({ id: "root-new", webViewLink: "https://drive/root" });
    expect(await ensureRootFolder("tok", "c1")).toBe("root-new");
    expect(m.db.googleConnection.update).toHaveBeenLastCalledWith({ where: { id: "c1" }, data: { rootFolderId: "root-new" } });
  });
});

describe("form folders", () => {
  it("reuses the folder another destination of this form made", async () => {
    m.db.destination.findMany.mockResolvedValueOnce([{ config: {} }, { config: { formFolderId: "gone" } }, { config: { formFolderId: "form-folder" } }]);
    m.getFile.mockRejectedValueOnce(new Error("404")).mockResolvedValueOnce({ id: "form-folder", trashed: false, webViewLink: "https://drive/form" });
    expect(await ensureFormFolder("tok", { connectionId: "c1", formId: "f1", title: "Recruitment" })).toEqual({ id: "form-folder", url: "https://drive/form", name: "", takenName: null });
  });

  it("creates it inside AIESEC Forms, and warns when the name is taken", async () => {
    m.db.destination.findMany.mockResolvedValue([]);
    m.db.googleConnection.findUnique.mockResolvedValue({ rootFolderId: "root-1" });
    m.getFile.mockResolvedValue({ id: "root-1", trashed: false });
    m.findFolder.mockResolvedValueOnce(null);
    m.createFolder.mockResolvedValueOnce({ id: "new", webViewLink: "https://drive/new" });
    const fresh = await ensureFormFolder("tok", { connectionId: "c1", formId: "f1", title: "  Recruitment  " });
    expect(fresh).toEqual({ id: "new", url: "https://drive/new", name: "Recruitment", takenName: null });
    expect(m.createFolder).toHaveBeenLastCalledWith("tok", "Recruitment", "root-1");
    expect(folderNotice(fresh)).toBeNull();

    m.findFolder.mockResolvedValueOnce({ id: "other" }).mockResolvedValueOnce({ id: "other-2" }).mockResolvedValueOnce(null);
    m.createFolder.mockResolvedValueOnce({ id: "new-3", webViewLink: "https://drive/new3" });
    const taken = await ensureFormFolder("tok", { connectionId: "c1", formId: "f2", title: "Recruitment" });
    expect(taken).toMatchObject({ name: "Recruitment (3)", takenName: "Recruitment" });
    expect(folderNotice(taken)).toBe('A folder named "Recruitment" already exists in AIESEC Forms, so this form\'s files are in "Recruitment (3)".');

    m.findFolder.mockResolvedValueOnce(null);
    m.createFolder.mockResolvedValueOnce({ id: "untitled", webViewLink: "https://drive/u" });
    expect((await ensureFormFolder("tok", { connectionId: "c1", formId: "f3", title: "   " })).name).toBe("Untitled form");
  });
});

describe("question upload folders", () => {
  const input = { destinationId: "d1", formFolderId: "form-folder", formTitle: "Recruitment", question: { id: "f_cv", label: "CV" } };

  it("reuses a question's folder while it exists", async () => {
    m.getFile.mockResolvedValueOnce({ id: "q-folder", trashed: false });
    expect(await ensureQuestionFolder("tok", { ...input, known: "q-folder" })).toBe("q-folder");
    expect(m.createFolder).not.toHaveBeenCalled();
  });

  it("creates '<form> <question> Uploads' and remembers it without losing others", async () => {
    m.getFile.mockResolvedValueOnce({ id: "q-folder", trashed: true });
    m.createFolder.mockResolvedValueOnce({ id: "q-new", webViewLink: "https://drive/q" });
    m.db.destination.findUnique.mockResolvedValueOnce({ config: { folderId: "form-folder", questionFolders: { f_photo: "photo-folder" } } });
    expect(await ensureQuestionFolder("tok", { ...input, known: "q-folder" })).toBe("q-new");
    expect(m.createFolder).toHaveBeenCalledWith("tok", "Recruitment CV Uploads", "form-folder");
    expect(m.db.destination.update.mock.calls[0][0].data.config).toEqual({ folderId: "form-folder", questionFolders: { f_photo: "photo-folder", f_cv: "q-new" } });

    m.createFolder.mockResolvedValueOnce({ id: "q-2", webViewLink: "https://drive/q2" });
    m.db.destination.findUnique.mockResolvedValueOnce(null);
    expect(await ensureQuestionFolder("tok", { ...input, known: undefined, question: { id: "f_x", label: "" } })).toBe("q-2");
    expect(m.createFolder).toHaveBeenLastCalledWith("tok", "Recruitment File upload Uploads", "form-folder");
  });
});
