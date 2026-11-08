import { afterEach, describe, expect, it, vi } from "vitest";

import { isFormPath, RESPONDENT_COOKIE, RESPONDENT_TTL_SECONDS, sealRespondent, unsealRespondent, type Respondent } from "@/lib/auth/respondent";
import { createField } from "@/lib/forms/fields";
import { buildCells, buildPayload, buildRowData, fieldHeaders, recordsRespondent } from "@/lib/forms/payload";
import { accessSchema, type FormAccess, type FormDocument } from "@/lib/forms/schema";
import { blankDocument } from "@/lib/forms/templates";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }) }));
const getSession = vi.fn();
vi.mock("@/lib/auth/current-user", () => ({ getSession: () => getSession() }));
const db = {
  user: { findUnique: vi.fn() },
  formRespondent: { findUnique: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db }));

const { accessProblem, claimResponse, currentRespondent, hasResponded, releaseResponse, respondentKey } = await import("@/lib/forms/respondents");

const lina: Respondent = { aiesecId: "5099966", name: "Lina Haddad", email: "lina@example.org", member: true };
const access = (patch: Partial<FormAccess> = {}): FormAccess => ({ ...accessSchema.parse({ mode: "aiesec" }), ...patch });

afterEach(() => {
  cookieJar.clear();
  vi.clearAllMocks();
});

describe("respondent cookie", () => {
  it("round-trips and expires after 12 hours", async () => {
    const sealed = await sealRespondent(lina, 1_000);
    expect(await unsealRespondent(sealed, 1_001)).toEqual(lina);
    expect(await unsealRespondent(sealed, 1_000 + RESPONDENT_TTL_SECONDS)).toBeNull();
  });

  it("rejects tampered, foreign and oversized values", async () => {
    const sealed = await sealRespondent(lina);
    expect(await unsealRespondent(`${sealed.slice(0, -4)}AAAA`)).toBeNull();
    expect(await unsealRespondent("not-a-jwe")).toBeNull();
    expect(await unsealRespondent("x".repeat(5000))).toBeNull();
    expect(await unsealRespondent(undefined)).toBeNull();
  });

  it("only returns people to form pages", () => {
    expect(isFormPath("/f/recruitment-27")).toBe(true);
    expect(isFormPath("/f/recruitment-27?signin=denied")).toBe(true);
    for (const path of ["/forms", "/f/", "/f/../admin", "//evil.example/f/x", "/f/UPPER", "/embed/abc"]) expect(isFormPath(path), path).toBe(false);
  });
});

describe("who may answer", () => {
  it("lets anyone answer open forms", () => {
    expect(accessProblem(accessSchema.parse({}), null, false)).toBeNull();
  });

  it("asks for sign-in, membership and a single response as configured", () => {
    expect(accessProblem(access(), null, false)).toBe("sign_in");
    expect(accessProblem(access({ membersOnly: true }), { ...lina, member: false }, false)).toBe("members_only");
    expect(accessProblem(access({ membersOnly: true }), lina, false)).toBeNull();
    expect(accessProblem(access({ onePerPerson: true }), lina, true)).toBe("already_responded");
    expect(accessProblem(access({ onePerPerson: false }), lina, true)).toBeNull();
  });

  it("prefers the respondent cookie, then a signed-in member, else nobody", async () => {
    cookieJar.set(RESPONDENT_COOKIE, await sealRespondent(lina));
    expect(await currentRespondent()).toEqual({ ...lina, source: "respondent" });

    cookieJar.clear();
    getSession.mockResolvedValue({ uid: "user-1" });
    db.user.findUnique.mockResolvedValue({ aiesecPersonId: 9000000001n, fullName: "Dev Member", email: null, positionTitle: "Team member" });
    expect(await currentRespondent()).toEqual({ aiesecId: "9000000001", name: "Dev Member", email: null, member: true, source: "app" });

    getSession.mockResolvedValue(null);
    expect(await currentRespondent()).toBeNull();
  });
});

describe("one response per person", () => {
  it("stores a keyed hash per form, never the person id", () => {
    const key = respondentKey("form-a", lina.aiesecId);
    expect(key).toBe(respondentKey("form-a", lina.aiesecId));
    expect(key).not.toBe(respondentKey("form-b", lina.aiesecId));
    expect(key).not.toContain(lina.aiesecId);
  });

  it("claims once, allows the same response to retry, refuses a second response", async () => {
    db.formRespondent.createMany.mockResolvedValueOnce({ count: 1 });
    expect(await claimResponse("form-a", lina.aiesecId, "response-1")).toBe(true);

    db.formRespondent.createMany.mockResolvedValue({ count: 0 });
    db.formRespondent.findUnique.mockResolvedValue({ responseId: "response-1" });
    expect(await claimResponse("form-a", lina.aiesecId, "response-1")).toBe(true);
    expect(await claimResponse("form-a", lina.aiesecId, "response-2")).toBe(false);
  });

  it("checks and releases claims", async () => {
    db.formRespondent.findUnique.mockResolvedValueOnce({ formId: "form-a" });
    expect(await hasResponded("form-a", lina.aiesecId)).toBe(true);
    db.formRespondent.findUnique.mockResolvedValueOnce(null);
    expect(await hasResponded("form-a", lina.aiesecId)).toBe(false);
    db.formRespondent.deleteMany.mockResolvedValue({ count: 1 });
    await releaseResponse("form-a", lina.aiesecId, "response-1");
    expect(db.formRespondent.deleteMany).toHaveBeenCalledWith({ where: { formId: "form-a", respondentKey: respondentKey("form-a", lina.aiesecId), responseId: "response-1" } });
  });
});

describe("recording who responded", () => {
  const name = { ...createField("short_text"), label: "Motivation" };
  const withAccess = (patch: Partial<FormAccess>): FormDocument => {
    const doc = blankDocument("Recruitment");
    return { ...doc, pages: [{ ...doc.pages[0], fields: [name] }], settings: { ...doc.settings, access: { ...doc.settings.access, ...patch } } };
  };
  const info = { aiesecId: lina.aiesecId, name: lina.name, email: lina.email };

  it("adds Name, Email and AIESEC ID columns first when recording", () => {
    const doc = withAccess({ mode: "aiesec", recordRespondent: true });
    expect(recordsRespondent(doc)).toBe(true);
    expect(fieldHeaders(doc).map((header) => header.header)).toEqual(["Name", "Email", "AIESEC ID", "Motivation"]);
    const cells = buildCells(doc, { [name.id]: "Grow" }, info);
    expect(cells).toMatchObject({ "respondent.name": "Lina Haddad", "respondent.email": "lina@example.org", "respondent.aiesecId": "5099966", [name.id]: "Grow" });
    expect(buildCells(doc, { [name.id]: "Grow" })["respondent.name"]).toBe("");
  });

  it("leaves responses anonymous when not recording", () => {
    for (const doc of [withAccess({ mode: "aiesec", recordRespondent: false }), withAccess({ mode: "anyone", recordRespondent: true })]) {
      expect(recordsRespondent(doc)).toBe(false);
      expect(fieldHeaders(doc).map((header) => header.header)).toEqual(["Motivation"]);
      expect(buildPayload({ responseId: "r", submittedAt: new Date(0), form: { id: "f", slug: "s" }, doc, values: {}, respondent: info }).respondent).toBeNull();
    }
  });

  it("puts the respondent into webhook payloads and database rows", () => {
    const doc = withAccess({ mode: "aiesec", recordRespondent: true });
    const payload = buildPayload({ responseId: "r", submittedAt: new Date(0), form: { id: "f", slug: "s" }, doc, values: { [name.id]: "Grow" }, respondent: info });
    expect(payload.respondent).toEqual(info);
    const row = buildRowData(payload.answers, payload.respondent);
    expect(row["respondent.email"]).toEqual({ label: "Email", value: "lina@example.org" });
    expect(row[name.id]).toEqual({ label: "Motivation", value: "Grow" });
    expect(Object.keys(buildRowData(payload.answers))).toEqual([name.id]);
  });
});
