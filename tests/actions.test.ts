import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encryptSecret } from "@/lib/crypto";
import { createField } from "@/lib/forms/fields";
import { blankDocument } from "@/lib/forms/templates";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getFormAccess: vi.fn(),
  recordAudit: vi.fn(),
  loadCollaboration: vi.fn(),
  prepareDestinations: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  db: {
    form: { updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    destination: { findMany: vi.fn() },
    googleConnection: { findFirst: vi.fn(), delete: vi.fn() },
    formCollaborator: { count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), create: vi.fn() },
    formInvite: { count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/forms/access", () => ({ getFormAccess: m.getFormAccess }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/forms/collaboration", () => ({ loadCollaboration: m.loadCollaboration }));
vi.mock("@/lib/destinations/prepare", () => ({ prepareDestinations: m.prepareDestinations }));
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7", "user-agent": "test" }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

const builder = await import("@/actions/builder");
const forms = await import("@/actions/forms");
const publish = await import("@/actions/publish");
const collaborators = await import("@/actions/collaborators");
const google = await import("@/actions/google");

const FORM_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";
const user = { id: "owner-1", email: "lina@example.org" };
const question = { ...createField("short_text"), label: "Name" };
const doc = (() => {
  const base = blankDocument("Recruitment");
  return { ...base, pages: [{ ...base.pages[0], fields: [question] }] };
})();
const form = (patch: Record<string, unknown> = {}) => ({ id: FORM_ID, slug: "recruitment", ownerId: user.id, revision: 3, draft: doc, publishedAt: null as Date | null, ...patch });
const access = (patch: Record<string, unknown> = {}, role: "owner" | "editor" = "owner") => ({ form: form(patch), role });
const p2002 = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" });

beforeEach(() => {
  m.getCurrentUser.mockResolvedValue(user);
  m.getFormAccess.mockResolvedValue(access());
  m.loadCollaboration.mockResolvedValue({ owner: { id: user.id } });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("every action needs a session and access", () => {
  it("refuses signed-out people and forms they can't edit", async () => {
    m.getCurrentUser.mockResolvedValue(null);
    for (const result of [
      await builder.saveDraft(FORM_ID, doc, 3),
      await builder.loadLatest(FORM_ID),
      await forms.createForm("blank"),
      await forms.duplicateForm(FORM_ID),
      await forms.trashForm(FORM_ID),
      await forms.restoreForm(FORM_ID),
      await publish.publishForm(FORM_ID, 3),
      await publish.updateSlug(FORM_ID, "x"),
      await publish.updateResponseRules(FORM_ID, { closesAt: null, responseLimit: null }),
      await publish.setEmbedDomains(FORM_ID, []),
      await publish.setAcceptingResponses(FORM_ID, true),
      await collaborators.addCollaborator(FORM_ID, "a@b.org"),
      await collaborators.removeCollaborator(FORM_ID, "u2"),
      await collaborators.revokeInvite(FORM_ID, "i1"),
      await collaborators.transferOwnership(FORM_ID, "u2"),
      await google.disconnectGoogle("c1"),
    ])
      expect(result.ok).toBe(false);

    m.getCurrentUser.mockResolvedValue(user);
    m.getFormAccess.mockResolvedValue(null);
    for (const result of [
      await builder.saveDraft(FORM_ID, doc, 3),
      await builder.loadLatest(FORM_ID),
      await forms.duplicateForm(FORM_ID),
      await forms.trashForm(FORM_ID),
      await forms.restoreForm(FORM_ID),
      await publish.publishForm(FORM_ID, 3),
      await publish.updateSlug(FORM_ID, "x"),
      await publish.updateResponseRules(FORM_ID, { closesAt: null, responseLimit: null }),
      await publish.setEmbedDomains(FORM_ID, []),
      await publish.setAcceptingResponses(FORM_ID, true),
      await collaborators.addCollaborator(FORM_ID, "a@b.org"),
      await collaborators.removeCollaborator(FORM_ID, "u2"),
      await collaborators.removeCollaborator(FORM_ID, user.id),
      await collaborators.revokeInvite(FORM_ID, "i1"),
      await collaborators.transferOwnership(FORM_ID, "u2"),
    ])
      expect(result.ok).toBe(false);
  });
});

describe("builder", () => {
  it("saves drafts with optimistic concurrency", async () => {
    m.db.form.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await builder.saveDraft(FORM_ID, doc, 3)).toEqual({ ok: true, data: { revision: 4 } });
    m.db.form.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await builder.saveDraft(FORM_ID, doc, 3)).toMatchObject({ ok: false, code: "conflict" });
    expect(await builder.saveDraft(FORM_ID, { nonsense: true }, 3)).toMatchObject({ ok: false, code: "invalid" });
    expect(await builder.saveDraft(FORM_ID, doc, 1.5)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("loads the latest draft", async () => {
    expect(await builder.loadLatest(FORM_ID)).toMatchObject({ ok: true, data: { revision: 3 } });
    m.getFormAccess.mockResolvedValueOnce(access({ draft: { broken: true } }));
    expect(await builder.loadLatest(FORM_ID)).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("forms", () => {
  it("creates a form from a template and opens it", async () => {
    m.db.form.create.mockRejectedValueOnce(p2002()).mockResolvedValueOnce({ id: "new-form" });
    await expect(forms.createForm("event")).rejects.toMatchObject({ url: "/forms/new-form/edit" });
    expect(m.db.form.create).toHaveBeenCalledTimes(2);
    expect(await forms.createForm("nope" as never)).toEqual({ ok: false, error: "Choose a template." });
    m.db.form.create.mockRejectedValueOnce(new Error("db down"));
    expect(await forms.createForm("blank")).toMatchObject({ ok: false });
  });

  it("duplicates, trashes and restores", async () => {
    m.db.form.create.mockResolvedValueOnce({ id: "copy" });
    expect(await forms.duplicateForm(FORM_ID)).toEqual({ ok: true, data: { id: "copy" } });
    expect(m.db.form.create.mock.calls[0][0].data.title).toBe("Copy of Recruitment");
    m.getFormAccess.mockResolvedValueOnce(access({ draft: {} }));
    expect(await forms.duplicateForm(FORM_ID)).toMatchObject({ ok: false });
    m.db.form.create.mockRejectedValue(p2002());
    expect(await forms.duplicateForm(FORM_ID)).toMatchObject({ ok: false, error: "We couldn't copy the form. Try again." });
    expect(await forms.trashForm(FORM_ID)).toEqual({ ok: true, data: undefined });
    expect(await forms.restoreForm(FORM_ID)).toEqual({ ok: true, data: undefined });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "form.restored", ip: "203.0.113.7" }));
  });
});

describe("publishing", () => {
  it("publishes when nothing blocks it", async () => {
    m.db.destination.findMany.mockResolvedValueOnce([{ id: "d1", role: "primary" }]);
    m.prepareDestinations.mockResolvedValueOnce(["Sheet: busy"]);
    m.db.form.updateMany.mockResolvedValueOnce({ count: 1 });
    const result = await publish.publishForm(FORM_ID, 3);
    expect(result).toMatchObject({ ok: true, data: { status: "published", publishedRevision: 3, warnings: ["Sheet: busy"] } });
    expect(m.revalidatePath).toHaveBeenCalledWith("/f/recruitment");
  });

  it("reports stale drafts, unreadable drafts and problems", async () => {
    expect(await publish.publishForm(FORM_ID, 2)).toEqual({ ok: true, data: { status: "stale" } });
    m.getFormAccess.mockResolvedValueOnce(access({ draft: {} }));
    expect(await publish.publishForm(FORM_ID, 3)).toMatchObject({ ok: false });
    m.db.destination.findMany.mockResolvedValueOnce([]);
    expect(await publish.publishForm(FORM_ID, 3)).toMatchObject({ ok: true, data: { status: "problems" } });
    m.db.destination.findMany.mockResolvedValueOnce([{ id: "d1", role: "primary" }]);
    m.prepareDestinations.mockResolvedValueOnce([]);
    m.db.form.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await publish.publishForm(FORM_ID, 3)).toEqual({ ok: true, data: { status: "stale" } });
  });

  it("changes the link, refusing reserved and taken ones", async () => {
    expect(await publish.updateSlug(FORM_ID, "admin")).toMatchObject({ ok: false, fieldErrors: { slug: expect.any(String) } });
    expect(await publish.updateSlug(FORM_ID, "recruitment")).toEqual({ ok: true, data: { slug: "recruitment" } });
    m.db.form.update.mockResolvedValueOnce({});
    expect(await publish.updateSlug(FORM_ID, "Recruitment Fall 27")).toEqual({ ok: true, data: { slug: "recruitment-fall-27" } });
    m.db.form.update.mockRejectedValueOnce(p2002());
    expect(await publish.updateSlug(FORM_ID, "taken-link")).toMatchObject({ ok: false, error: "That link is already taken. Try another." });
    m.db.form.update.mockRejectedValueOnce(new Error("db down"));
    await expect(publish.updateSlug(FORM_ID, "another-link")).rejects.toThrow("db down");
  });

  it("sets response rules, embed sites and whether the form is open", async () => {
    expect(await publish.updateResponseRules(FORM_ID, { closesAt: "2026-12-01T10:00:00+02:00", responseLimit: 100 })).toEqual({ ok: true, data: { closesAt: "2026-12-01T08:00:00.000Z", responseLimit: 100 } });
    expect(await publish.updateResponseRules(FORM_ID, { closesAt: "tomorrow", responseLimit: 0 })).toMatchObject({ ok: false });
    expect(await publish.setEmbedDomains(FORM_ID, ["https://aiesec.org/x", "*.aiesec.org"])).toEqual({ ok: true, data: { embedDomains: ["aiesec.org", "*.aiesec.org"] } });
    expect(await publish.setEmbedDomains(FORM_ID, ["not a site"])).toMatchObject({ ok: false });
    expect(await publish.setEmbedDomains(FORM_ID, Array.from({ length: 50 }, (_, index) => `s${index}.org`))).toMatchObject({ ok: false });
    expect(await publish.setAcceptingResponses(FORM_ID, false)).toEqual({ ok: true, data: { acceptingResponses: false } });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "form.closed" }));
  });
});

describe("collaborators", () => {
  beforeEach(() => {
    m.db.formCollaborator.count.mockResolvedValue(1);
    m.db.formInvite.count.mockResolvedValue(0);
  });

  it("adds members by email or EXPA ID, or invites by email", async () => {
    m.db.user.findFirst.mockResolvedValueOnce({ id: "u2" });
    expect(await collaborators.addCollaborator(FORM_ID, " Editor@Example.org ")).toMatchObject({ ok: true });
    expect(m.db.formCollaborator.upsert).toHaveBeenCalled();
    m.db.user.findUnique.mockResolvedValueOnce({ id: "u3" });
    expect(await collaborators.addCollaborator(FORM_ID, "5099966")).toMatchObject({ ok: true });
    m.db.user.findFirst.mockResolvedValueOnce(null);
    expect(await collaborators.addCollaborator(FORM_ID, "new@example.org")).toMatchObject({ ok: true });
    expect(m.db.formInvite.upsert).toHaveBeenCalled();
  });

  it("refuses bad identifiers, the owner, unknown IDs and full forms", async () => {
    expect(await collaborators.addCollaborator(FORM_ID, "   ")).toMatchObject({ ok: false });
    expect(await collaborators.addCollaborator(FORM_ID, "not an email")).toMatchObject({ ok: false });
    m.db.user.findFirst.mockResolvedValueOnce({ id: user.id });
    expect(await collaborators.addCollaborator(FORM_ID, "lina@example.org")).toMatchObject({ ok: false, error: expect.stringContaining("owner") });
    m.db.user.findUnique.mockResolvedValueOnce(null);
    expect(await collaborators.addCollaborator(FORM_ID, "123")).toMatchObject({ ok: false, error: expect.stringContaining("by email") });
    m.db.formCollaborator.count.mockResolvedValueOnce(20);
    m.db.formInvite.count.mockResolvedValueOnce(5);
    expect(await collaborators.addCollaborator(FORM_ID, "x@y.org")).toMatchObject({ ok: false, error: expect.stringContaining("25") });
    m.loadCollaboration.mockResolvedValueOnce(null);
    m.db.user.findFirst.mockResolvedValueOnce({ id: "u2" });
    expect(await collaborators.addCollaborator(FORM_ID, "e@x.org")).toMatchObject({ ok: false });
  });

  it("removes editors, lets editors leave, revokes invites and hands over ownership", async () => {
    expect(await collaborators.removeCollaborator(FORM_ID, "u2")).toMatchObject({ ok: true });
    m.getFormAccess.mockResolvedValueOnce(access({}, "editor"));
    expect(await collaborators.removeCollaborator(FORM_ID, user.id)).toEqual({ ok: true, data: { left: true } });
    expect(await collaborators.removeCollaborator(FORM_ID, user.id)).toMatchObject({ ok: false, error: expect.stringContaining("Transfer ownership") });
    expect(await collaborators.revokeInvite(FORM_ID, "i1")).toMatchObject({ ok: true });
    m.db.formCollaborator.findUnique.mockResolvedValueOnce(null);
    expect(await collaborators.transferOwnership(FORM_ID, "u2")).toMatchObject({ ok: false, error: expect.stringContaining("editor first") });
    m.db.formCollaborator.findUnique.mockResolvedValueOnce({ userId: "u2" });
    m.db.$transaction.mockResolvedValueOnce([]);
    expect(await collaborators.transferOwnership(FORM_ID, "u2")).toMatchObject({ ok: true });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "form.ownership_transferred" }));
  });
});

describe("Google disconnect", () => {
  it("revokes at Google when it can and always forgets the tokens", async () => {
    m.db.googleConnection.findFirst.mockResolvedValueOnce(null);
    expect(await google.disconnectGoogle("c1")).toEqual({ ok: true, data: undefined });
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    m.db.googleConnection.findFirst.mockResolvedValueOnce({ id: "c1", refreshTokenEnc: encryptSecret("refresh-1") });
    expect(await google.disconnectGoogle("c1")).toEqual({ ok: true, data: undefined });
    expect(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).toBe("token=refresh-1");
    m.db.googleConnection.findFirst.mockResolvedValueOnce({ id: "c2", refreshTokenEnc: "unreadable" });
    expect(await google.disconnectGoogle("c2")).toEqual({ ok: true, data: undefined });
    expect(m.db.googleConnection.delete).toHaveBeenCalledTimes(2);
  });
});
