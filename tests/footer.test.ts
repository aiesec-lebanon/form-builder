import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  db: {
    form: { findUnique: vi.fn(), updateMany: vi.fn() },
    formReport: { create: vi.fn(), updateMany: vi.fn() },
    formMessage: { create: vi.fn() },
  },
  currentRespondent: vi.fn(),
  verifyTurnstile: vi.fn(),
  rateLimit: vi.fn(),
  recordAudit: vi.fn(),
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: m.rateLimit }));
vi.mock("@/lib/audit", () => ({ recordAudit: m.recordAudit }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("@/lib/forms/respondents", () => ({ currentRespondent: m.currentRespondent }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: m.verifyTurnstile }));

const report = await import("@/app/api/f/[slug]/report/route");
const contact = await import("@/app/api/f/[slug]/contact/route");
const admin = await import("@/actions/admin");
const { reportSchema } = await import("@/lib/forms/reports");

const ORIGIN = "http://localhost:3000";
const params = { params: Promise.resolve({ slug: "recruitment" }) };
const live = { id: "form-1", published: { pages: [] }, deletedAt: null };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}/api/f/recruitment/report`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify(body) });
}

beforeEach(() => {
  m.rateLimit.mockResolvedValue({ allowed: true, remaining: 5 });
  m.db.form.findUnique.mockResolvedValue(live);
  m.currentRespondent.mockResolvedValue(null);
  m.verifyTurnstile.mockResolvedValue({ ok: true });
});

afterEach(() => vi.clearAllMocks());

describe("report schema", () => {
  it("trims details and drops empty optional fields", () => {
    expect(reportSchema.parse({ reason: "spam", details: "  ", contact: "" })).toMatchObject({ reason: "spam", details: null, contact: null });
    expect(reportSchema.parse({ reason: "other", details: " Looks fake ", contact: "a@b.org" })).toMatchObject({ details: "Looks fake", contact: "a@b.org" });
    expect(reportSchema.safeParse({ reason: "nope" }).success).toBe(false);
  });
});

describe("reporting a form", () => {
  it("stores the report with a hashed IP and logs it for admins", async () => {
    const response = await report.POST(post({ reason: "passwords", details: "Asks for my EXPA password", contact: "" }), params);
    expect(response.status).toBe(200);
    const data = m.db.formReport.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ formId: "form-1", reason: "passwords", details: "Asks for my EXPA password", contact: null });
    expect(data.ipHash).toMatch(/^[0-9a-f]{16,}$/);
    expect(data.ipHash).not.toContain("203.0.113.9");
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "form.reported", target: { type: "form", id: "form-1" }, metadata: { reason: "passwords" } }));
  });

  it("refuses other sites, bad input, missing forms and floods", async () => {
    expect((await report.POST(post({ reason: "spam" }, { origin: "https://evil.example" }), params)).status).toBe(403);
    expect((await report.POST(new NextRequest(`${ORIGIN}/api/f/recruitment/report`, { method: "POST", headers: { origin: ORIGIN }, body: "{" }), params)).status).toBe(400);
    const noReason = await report.POST(post({ details: "x" }), params);
    expect(noReason.status).toBe(422);
    expect(await noReason.json()).toMatchObject({ message: expect.stringContaining("Choose") });
    expect(await (await report.POST(post({ reason: "spam", contact: "not-an-email" }), params)).json()).toMatchObject({ message: expect.stringContaining("valid email") });
    m.db.form.findUnique.mockResolvedValueOnce({ ...live, deletedAt: new Date() });
    expect((await report.POST(post({ reason: "spam" }), params)).status).toBe(404);
    m.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await report.POST(post({ reason: "spam" }), params)).status).toBe(429);
    expect(m.db.formReport.create).not.toHaveBeenCalled();
  });

  it("quietly drops bot reports", async () => {
    expect((await report.POST(post({ reason: "spam", website: "http://spam" }), params)).status).toBe(200);
    expect(m.db.formReport.create).not.toHaveBeenCalled();
  });
});

describe("contacting the owner", () => {
  const message = { name: "Lina Haddad", email: "lina@example.org", subject: "Deadline", message: "Can I still apply next week?" };
  const send = (body: unknown, headers: Record<string, string> = {}) =>
    contact.POST(new NextRequest(`${ORIGIN}/api/f/recruitment/contact`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers }, body: JSON.stringify(body) }), params);

  it("stores the message for the owner, never revealing their email", async () => {
    const response = await send(message);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sent: true });
    expect(m.db.formMessage.create.mock.calls[0][0].data).toMatchObject({ formId: "form-1", senderName: "Lina Haddad", senderEmail: "lina@example.org", subject: "Deadline", body: "Can I still apply next week?", verified: false });
    expect(m.db.formMessage.create.mock.calls[0][0].data.ipHash).not.toContain("203.0.113.9");
  });

  it("uses the AIESEC sign-in for name and email when there is one", async () => {
    m.currentRespondent.mockResolvedValueOnce({ aiesecId: "5099966", name: "Rami Khoury", email: "rami@aiesec.net", member: true, source: "respondent" });
    expect((await send({ subject: "Hi", message: "Question about the form" })).status).toBe(200);
    expect(m.db.formMessage.create.mock.calls[0][0].data).toMatchObject({ senderName: "Rami Khoury", senderEmail: "rami@aiesec.net", verified: true });
  });

  it("explains what to fix, field by field", async () => {
    const response = await send({ name: " ", email: "nope", subject: "", message: "" });
    expect(response.status).toBe(422);
    expect((await response.json()).fieldErrors).toEqual({ name: "Enter your name.", email: "Enter an email like name@example.com.", subject: "Add a subject.", message: "Write your message." });
    expect((await (await send({ ...message, subject: "x".repeat(151) })).json()).fieldErrors).toEqual({ subject: expect.stringContaining("150") });
    expect(m.db.formMessage.create).not.toHaveBeenCalled();
  });

  it("refuses other sites, missing forms, floods and failed bot checks", async () => {
    expect((await send(message, { origin: "https://evil.example" })).status).toBe(403);
    expect((await contact.POST(new NextRequest(`${ORIGIN}/api/f/recruitment/contact`, { method: "POST", headers: { origin: ORIGIN }, body: "{" }), params)).status).toBe(400);
    m.db.form.findUnique.mockResolvedValueOnce({ ...live, published: null });
    expect((await send(message)).status).toBe(404);
    m.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await send(message)).status).toBe(429);
    m.verifyTurnstile.mockResolvedValueOnce({ ok: false, reason: "invalid" });
    const bot = await send(message);
    expect(bot.status).toBe(403);
    expect(await bot.json()).toMatchObject({ error: "bot_check" });
    expect(m.db.formMessage.create).not.toHaveBeenCalled();
  });

  it("quietly drops bot messages", async () => {
    expect((await send({ ...message, website: "http://spam" })).status).toBe(200);
    expect(m.db.formMessage.create).not.toHaveBeenCalled();
  });
});

describe("admin review", () => {
  it("only lets platform admins act", async () => {
    m.getCurrentUser.mockResolvedValue({ id: "u1", isAdmin: false });
    expect(await admin.closeReportedForm("form-1")).toMatchObject({ ok: false });
    expect(await admin.markReportReviewed("r1")).toMatchObject({ ok: false });
    m.getCurrentUser.mockResolvedValue(null);
    expect(await admin.closeReportedForm("form-1")).toMatchObject({ ok: false });
    expect(m.db.form.updateMany).not.toHaveBeenCalled();
  });

  it("closes a reported form and marks its reports reviewed", async () => {
    m.getCurrentUser.mockResolvedValue({ id: "admin-1", isAdmin: true });
    m.db.form.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await admin.closeReportedForm("form-1")).toEqual({ ok: true, data: undefined });
    expect(m.db.form.updateMany).toHaveBeenCalledWith({ where: { id: "form-1", deletedAt: null }, data: { acceptingResponses: false } });
    expect(m.db.formReport.updateMany).toHaveBeenCalledWith({ where: { formId: "form-1", reviewedAt: null }, data: { reviewedAt: expect.any(Date) } });
    expect(m.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ type: "form.closed", actorId: "admin-1", metadata: { reason: "report" } }));
    m.db.form.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await admin.closeReportedForm("gone")).toMatchObject({ ok: false });
  });

  it("marks a single report reviewed once", async () => {
    m.getCurrentUser.mockResolvedValue({ id: "admin-1", isAdmin: true });
    m.db.formReport.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await admin.markReportReviewed("r1")).toMatchObject({ ok: true });
    expect(await admin.markReportReviewed("r1")).toMatchObject({ ok: true });
    expect(m.recordAudit).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/activity");
  });
});
