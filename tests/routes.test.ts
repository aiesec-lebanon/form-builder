import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PURPOSE_COOKIE, RESPONDENT_COOKIE, unsealRespondent } from "@/lib/auth/respondent";
import { newSessionPayload, nowSeconds, sealSession, SESSION_COOKIE, unsealSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";
import { createField } from "@/lib/forms/fields";
import { issueRenderToken } from "@/lib/forms/render-token";
import { accessSchema, type FormDocument } from "@/lib/forms/schema";
import { blankDocument } from "@/lib/forms/templates";

const mocks = vi.hoisted(() => ({
  db: {
    form: { findUnique: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    auditEvent: { create: vi.fn(), deleteMany: vi.fn() },
    formMessage: { deleteMany: vi.fn() },
    googleConnection: { upsert: vi.fn() },
    $queryRaw: vi.fn(),
  },
  rateLimit: vi.fn(),
  pruneRateLimits: vi.fn(),
  deliverToPrimary: vi.fn(),
  deliverToSecondaries: vi.fn(),
  resolveUploadedFiles: vi.fn(),
  filesDestination: vi.fn(),
  finalizeUploads: vi.fn(),
  cleanOrphanedUploads: vi.fn(),
  verifyTurnstile: vi.fn(),
  currentRespondent: vi.fn(),
  claimResponse: vi.fn(),
  releaseResponse: vi.fn(),
  googleAccessToken: vi.fn(),
  startResumableUpload: vi.fn(),
  ensureQuestionFolder: vi.fn(),
  getCurrentUser: vi.fn(),
  exchangeGoogleCode: vi.fn(),
  exchangeCode: vi.fn(),
  fetchCurrentPerson: vi.fn(),
  upsertUser: vi.fn(),
  acceptPendingInvites: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (task: () => unknown) => void task() }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, pruneRateLimits: mocks.pruneRateLimits }));
vi.mock("@/lib/destinations/deliver", () => ({ deliverToPrimary: mocks.deliverToPrimary, deliverToSecondaries: mocks.deliverToSecondaries }));
vi.mock("@/lib/uploads", async (original) => ({ ...(await original<typeof import("@/lib/uploads")>()), resolveUploadedFiles: mocks.resolveUploadedFiles, filesDestination: mocks.filesDestination, finalizeUploads: mocks.finalizeUploads, cleanOrphanedUploads: mocks.cleanOrphanedUploads }));
vi.mock("@/lib/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/lib/forms/respondents", async (original) => ({
  ...(await original<typeof import("@/lib/forms/respondents")>()),
  currentRespondent: mocks.currentRespondent,
  claimResponse: mocks.claimResponse,
  releaseResponse: mocks.releaseResponse,
}));
vi.mock("@/lib/google/tokens", () => ({ googleAccessToken: mocks.googleAccessToken }));
vi.mock("@/lib/google/api", async (original) => ({ ...(await original<typeof import("@/lib/google/api")>()), startResumableUpload: mocks.startResumableUpload }));
vi.mock("@/lib/google/folders", () => ({ ensureQuestionFolder: mocks.ensureQuestionFolder }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/google/oauth", async (original) => ({ ...(await original<typeof import("@/lib/google/oauth")>()), exchangeGoogleCode: mocks.exchangeGoogleCode }));
vi.mock("@/lib/auth/oauth", async (original) => ({ ...(await original<typeof import("@/lib/auth/oauth")>()), exchangeCode: mocks.exchangeCode }));
vi.mock("@/lib/auth/gis", async (original) => ({ ...(await original<typeof import("@/lib/auth/gis")>()), fetchCurrentPerson: mocks.fetchCurrentPerson }));
vi.mock("@/lib/auth/sign-in", async (original) => ({ ...(await original<typeof import("@/lib/auth/sign-in")>()), upsertUser: mocks.upsertUser, acceptPendingInvites: mocks.acceptPendingInvites }));

const submit = await import("@/app/api/f/[slug]/submit/route");
const upload = await import("@/app/api/f/[slug]/upload/route");
const login = await import("@/app/api/auth/login/route");
const callback = await import("@/app/api/auth/callback/route");
const logout = await import("@/app/api/auth/logout/route");
const respondentLogout = await import("@/app/api/auth/respondent/logout/route");
const cron = await import("@/app/api/cron/cleanup/route");
const health = await import("@/app/api/health/route");
const devLogin = await import("@/app/api/auth/dev-login/route");
const googleConnect = await import("@/app/api/google/connect/route");
const googleCallback = await import("@/app/api/google/callback/route");
const { GoogleAuthError } = await import("@/lib/google/oauth");
const { OAuthError } = await import("@/lib/auth/oauth");

const ORIGIN = "http://localhost:3000";
const FORM_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";
const RESPONSE_ID = "0b7d3f8e-2c1a-4f5e-9d6b-1a2b3c4d5e6f";
const name = { ...createField("short_text"), id: "f_namefield", label: "Name", required: true };
const cv = { ...createField("file_upload"), id: "f_cvfield01", label: "CV", accept: ["pdf" as const], maxSizeMb: 5 };

function documentWith(patch: Partial<FormDocument["settings"]["access"]> = {}): FormDocument {
  const doc = blankDocument("Recruitment");
  return { ...doc, pages: [{ ...doc.pages[0], fields: [name, cv] }], settings: { ...doc.settings, access: { ...accessSchema.parse({}), ...patch } } };
}
const form = (patch: Record<string, unknown> = {}) => ({
  id: FORM_ID,
  slug: "recruitment",
  published: documentWith(),
  acceptingResponses: true,
  closesAt: null,
  responseLimit: null,
  responseCount: 0,
  deletedAt: null,
  ...patch,
});
const params = { params: Promise.resolve({ slug: "recruitment" }) };
function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`${ORIGIN}${path}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
const submission = (patch: Record<string, unknown> = {}) => ({ responseId: RESPONSE_ID, renderToken: issueRenderToken(FORM_ID, Date.now() - 5000), answers: { [name.id]: "Lina" }, ...patch });
const lina = { aiesecId: "5099966", name: "Lina Haddad", email: "lina@example.org", member: true, source: "respondent" as const };

beforeEach(() => {
  mocks.db.form.findUnique.mockResolvedValue(form());
  mocks.db.form.update.mockResolvedValue({});
  mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
  mocks.verifyTurnstile.mockResolvedValue({ ok: true });
  mocks.deliverToPrimary.mockResolvedValue({ ok: true, secondaries: [] });
  mocks.claimResponse.mockResolvedValue(true);
  mocks.releaseResponse.mockResolvedValue(undefined);
  mocks.currentRespondent.mockResolvedValue(null);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("submit endpoint", () => {
  it("delivers a valid response, counts it and sends to secondaries afterwards", async () => {
    mocks.deliverToPrimary.mockResolvedValueOnce({ ok: true, secondaries: [{ id: "s1" }] });
    const response = await submit.POST(post("/api/f/recruitment/submit", submission()), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, responseId: RESPONSE_ID });
    expect(mocks.deliverToPrimary.mock.calls[0][1].payload.answers[0]).toMatchObject({ fieldId: name.id, value: "Lina" });
    expect(mocks.db.form.update).toHaveBeenCalled();
    expect(mocks.deliverToSecondaries).toHaveBeenCalled();
  });

  it("refuses bad requests early", async () => {
    expect((await submit.POST(post("/api/f/recruitment/submit", submission(), { origin: "https://evil.example" }), params)).status).toBe(403);
    expect((await submit.POST(post("/api/f/recruitment/submit", "x".repeat(300 * 1024)), params)).status).toBe(413);
    expect((await submit.POST(post("/api/f/recruitment/submit", "{oops"), params)).status).toBe(400);
    expect((await submit.POST(post("/api/f/recruitment/submit", { responseId: "nope" }), params)).status).toBe(400);
  });

  it("knows missing and closed forms", async () => {
    mocks.db.form.findUnique.mockResolvedValueOnce(null);
    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(404);
    mocks.db.form.findUnique.mockResolvedValueOnce(form({ acceptingResponses: false }));
    const closed = await submit.POST(post("/api/f/recruitment/submit", submission()), params);
    expect(closed.status).toBe(410);
    expect(await closed.json()).toMatchObject({ reason: "closed" });
  });

  it("quietly accepts honeypot submissions without delivering", async () => {
    const response = await submit.POST(post("/api/f/recruitment/submit", submission({ website: "spam.example" })), params);
    expect(response.status).toBe(200);
    expect(mocks.deliverToPrimary).not.toHaveBeenCalled();
  });

  it("checks the render token, rate limits and the bot check", async () => {
    expect((await submit.POST(post("/api/f/recruitment/submit", submission({ renderToken: "forged" })), params)).status).toBe(403);
    const fast = await submit.POST(post("/api/f/recruitment/submit", submission({ renderToken: issueRenderToken(FORM_ID) })), params);
    expect(fast.status).toBe(429);
    expect(await fast.json()).toMatchObject({ error: "too_fast" });
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(429);
    mocks.verifyTurnstile.mockResolvedValueOnce({ ok: false, reason: "rejected" });
    const bot = await submit.POST(post("/api/f/recruitment/submit", submission()), params);
    expect(bot.status).toBe(403);
    expect(await bot.json()).toMatchObject({ error: "bot_check" });
  });

  it("refuses unreadable forms and invalid answers", async () => {
    mocks.db.form.findUnique.mockResolvedValueOnce(form({ published: { garbage: true } }));
    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(500);
    const invalid = await submit.POST(post("/api/f/recruitment/submit", submission({ answers: { [name.id]: "" } })), params);
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ fieldErrors: { [name.id]: expect.any(String) } });
  });

  it("verifies uploaded files", async () => {
    const answers = { [name.id]: "Lina", [cv.id]: [{ fileId: "drive-file-0001", name: "cv.pdf", size: 10, mimeType: "application/pdf" }] };
    mocks.resolveUploadedFiles.mockResolvedValueOnce({ ok: false, status: 422, fieldErrors: { [cv.id]: "Upload again" } });
    expect((await submit.POST(post("/api/f/recruitment/submit", submission({ answers })), params)).status).toBe(422);
    mocks.resolveUploadedFiles.mockResolvedValueOnce({ ok: false, status: 502, message: "Drive is down" });
    expect((await submit.POST(post("/api/f/recruitment/submit", submission({ answers })), params)).status).toBe(502);
    mocks.resolveUploadedFiles.mockResolvedValueOnce({ ok: true, values: { [cv.id]: [{ name: "cv.pdf", url: "https://drive/x", size: 10, mimeType: "application/pdf" }] } });
    expect((await submit.POST(post("/api/f/recruitment/submit", submission({ answers })), params)).status).toBe(200);
    expect(mocks.finalizeUploads).toHaveBeenCalledWith(FORM_ID, [{ fileId: "drive-file-0001", name: null }]);
  });

  it("enforces AIESEC sign-in, membership and one response per person", async () => {
    mocks.db.form.findUnique.mockResolvedValue(form({ published: documentWith({ mode: "aiesec", membersOnly: true, onePerPerson: true, recordRespondent: true }) }));
    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(401);
    mocks.currentRespondent.mockResolvedValue({ ...lina, member: false });
    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(403);
    mocks.currentRespondent.mockResolvedValue(lina);
    mocks.claimResponse.mockResolvedValueOnce(false);
    const again = await submit.POST(post("/api/f/recruitment/submit", submission()), params);
    expect(again.status).toBe(409);
    expect(await again.json()).toMatchObject({ error: "already_responded" });

    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(200);
    expect(mocks.deliverToPrimary.mock.calls.at(-1)?.[1].payload.respondent).toEqual({ aiesecId: "5099966", name: "Lina Haddad", email: "lina@example.org" });

    mocks.deliverToPrimary.mockResolvedValueOnce({ ok: false, retryable: true, message: "down" });
    mocks.releaseResponse.mockRejectedValueOnce(new Error("db"));
    expect((await submit.POST(post("/api/f/recruitment/submit", submission()), params)).status).toBe(502);
    expect(mocks.releaseResponse).toHaveBeenCalledWith(FORM_ID, "5099966", RESPONSE_ID);
  });
});

describe("upload endpoint", () => {
  const start = (patch: Record<string, unknown> = {}) => post("/api/f/recruitment/upload", { fieldId: cv.id, responseId: RESPONSE_ID, name: "cv.pdf", size: 1000, mimeType: "application/pdf", ...patch });

  it("opens a Drive upload for an allowed file", async () => {
    mocks.filesDestination.mockResolvedValueOnce({ destinationId: "d1", connectionId: "c1", folderId: "folder-0001", questionFolders: {} });
    mocks.googleAccessToken.mockResolvedValueOnce("tok");
    mocks.ensureQuestionFolder.mockResolvedValueOnce("question-folder");
    mocks.startResumableUpload.mockResolvedValueOnce("https://upload/session");
    const response = await upload.POST(start(), params);
    expect(await response.json()).toEqual({ ok: true, uploadUrl: "https://upload/session" });
    expect(mocks.ensureQuestionFolder.mock.calls[0][1]).toMatchObject({ destinationId: "d1", formFolderId: "folder-0001", formTitle: "Recruitment", question: { id: cv.id, label: "CV" } });
    expect(mocks.startResumableUpload.mock.calls[0][1]).toMatchObject({ folderId: "question-folder", origin: ORIGIN, appProperties: { formId: FORM_ID, responseId: RESPONSE_ID, fieldId: cv.id } });
  });

  it("refuses what doesn't belong", async () => {
    expect((await upload.POST(start({}), { params: Promise.resolve({ slug: "recruitment" }) })).status).not.toBe(403);
    expect((await upload.POST(post("/api/f/recruitment/upload", {}, { origin: "https://evil.example" }), params)).status).toBe(403);
    expect((await upload.POST(post("/api/f/recruitment/upload", "{bad"), params)).status).toBe(400);
    expect((await upload.POST(post("/api/f/recruitment/upload", { fieldId: cv.id }), params)).status).toBe(400);
    mocks.db.form.findUnique.mockResolvedValueOnce(null);
    expect((await upload.POST(start(), params)).status).toBe(404);
    mocks.db.form.findUnique.mockResolvedValueOnce(form({ acceptingResponses: false }));
    expect((await upload.POST(start(), params)).status).toBe(410);
    expect((await upload.POST(start({ fieldId: name.id }), params)).status).toBe(400);
    expect((await upload.POST(start({ size: 50 * 1024 * 1024 }), params)).status).toBe(422);
    expect((await upload.POST(start({ mimeType: "application/x-msdownload" }), params)).status).toBe(422);
    mocks.rateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await upload.POST(start(), params)).status).toBe(429);
    mocks.filesDestination.mockResolvedValueOnce(null);
    expect((await upload.POST(start(), params)).status).toBe(503);
    mocks.filesDestination.mockResolvedValueOnce({ destinationId: "d1", connectionId: "c1", folderId: "folder-0001", questionFolders: {} });
    mocks.googleAccessToken.mockRejectedValueOnce(new GoogleAuthError("revoked", "gone"));
    expect((await upload.POST(start(), params)).status).toBe(502);
  });

  it("takes files on AIESEC-only forms only from people who may answer", async () => {
    mocks.db.form.findUnique.mockResolvedValue(form({ published: documentWith({ mode: "aiesec", membersOnly: true }) }));
    expect((await upload.POST(start(), params)).status).toBe(401);
    mocks.currentRespondent.mockResolvedValueOnce({ ...lina, member: false });
    expect((await upload.POST(start(), params)).status).toBe(403);
  });
});

describe("AIESEC sign-in", () => {
  const callbackRequest = (query: string, cookies: Record<string, string>) =>
    new NextRequest(`${ORIGIN}/api/auth/callback?${query}`, { headers: { cookie: Object.entries(cookies).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("; ") } });
  const person = { id: "5099966", full_name: "Lina Haddad", email: "Lina@Example.org", current_positions: [{ id: "1", title: "LCVP", office: { id: "100", name: "Beirut" } }] };
  const tokens = { accessToken: "at", refreshToken: "rt", expiresAt: nowSeconds() + 3600 };

  it("starts sign-in, for the app or to answer a form", async () => {
    const app = await login.GET(new NextRequest(`${ORIGIN}/api/auth/login?returnTo=/forms`));
    expect(app.status).toBe(307);
    expect(app.cookies.get(PURPOSE_COOKIE)?.value).toBe("");
    const respond = await login.GET(new NextRequest(`${ORIGIN}/api/auth/login?purpose=respond&returnTo=/f/recruitment`));
    expect(respond.cookies.get(PURPOSE_COOKIE)?.value).toBe("respond");
    const sneaky = await login.GET(new NextRequest(`${ORIGIN}/api/auth/login?purpose=respond&returnTo=/admin`));
    expect(sneaky.cookies.get(PURPOSE_COOKIE)?.value).toBe("");
  });

  it("signs members in to the app", async () => {
    mocks.exchangeCode.mockResolvedValueOnce(tokens);
    mocks.fetchCurrentPerson.mockResolvedValueOnce(person);
    mocks.upsertUser.mockResolvedValueOnce({ id: "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b13" });
    mocks.acceptPendingInvites.mockResolvedValueOnce(0);
    const response = await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1", fb_oauth_return_to: "/forms/abc" }));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/forms/abc`);
    expect(await unsealSession(response.cookies.get(SESSION_COOKIE)?.value)).toMatchObject({ pid: "5099966", at: "at" });
  });

  it("signs respondents in without an app account", async () => {
    mocks.exchangeCode.mockResolvedValueOnce(tokens);
    mocks.fetchCurrentPerson.mockResolvedValueOnce(person);
    const response = await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1", fb_oauth_return_to: "/f/recruitment", [PURPOSE_COOKIE]: "respond" }));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/f/recruitment`);
    expect(await unsealRespondent(response.cookies.get(RESPONDENT_COOKIE)?.value)).toEqual({ aiesecId: "5099966", name: "Lina Haddad", email: "lina@example.org", member: true });
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
    expect(mocks.upsertUser).not.toHaveBeenCalled();
    // Members are recorded with their AIESEC email when EXPA has one.
    mocks.exchangeCode.mockResolvedValueOnce(tokens);
    mocks.fetchCurrentPerson.mockResolvedValueOnce({ ...person, email: "lina@gmail.com", aiesec_email: "lina.haddad@aiesec.net" });
    const member = await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1", fb_oauth_return_to: "/f/recruitment", [PURPOSE_COOKIE]: "respond" }));
    expect(await unsealRespondent(member.cookies.get(RESPONDENT_COOKIE)?.value)).toMatchObject({ email: "lina.haddad@aiesec.net" });
  });

  it("sends respondents back to the form when sign-in fails", async () => {
    const cancelled = await callback.GET(callbackRequest("error=access_denied", { fb_oauth_state: "s1", fb_oauth_return_to: "/f/recruitment", [PURPOSE_COOKIE]: "respond" }));
    expect(cancelled.headers.get("location")).toBe(`${ORIGIN}/f/recruitment?signin=denied`);
    const appCancelled = await callback.GET(callbackRequest("error=access_denied", { fb_oauth_state: "s1" }));
    expect(appCancelled.headers.get("location")).toBe(`${ORIGIN}/login?error=denied`);
  });

  it("rejects mismatched state, missing codes and failed exchanges", async () => {
    expect((await callback.GET(callbackRequest("code=c&state=other", { fb_oauth_state: "s1" }))).headers.get("location")).toContain("error=state");
    expect((await callback.GET(callbackRequest("state=s1", { fb_oauth_state: "s1" }))).headers.get("location")).toContain("error=missing_code");
    mocks.exchangeCode.mockRejectedValueOnce(new OAuthError("unavailable", "down"));
    expect((await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1" }))).headers.get("location")).toContain("error=aiesec_unavailable");
    mocks.exchangeCode.mockRejectedValueOnce(new OAuthError("invalid", "bad"));
    expect((await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1" }))).headers.get("location")).toContain("error=exchange_failed");
    mocks.exchangeCode.mockResolvedValueOnce(tokens);
    mocks.fetchCurrentPerson.mockRejectedValueOnce(new Error("gis down"));
    expect((await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1" }))).headers.get("location")).toContain("error=aiesec_unavailable");
  });

  it("refuses members without a position and survives database errors", async () => {
    mocks.exchangeCode.mockResolvedValue(tokens);
    mocks.fetchCurrentPerson.mockResolvedValueOnce({ ...person, current_positions: [] });
    expect((await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1" }))).headers.get("location")).toBe(`${ORIGIN}/unauthorized?reason=no_position`);
    mocks.fetchCurrentPerson.mockResolvedValueOnce(person);
    mocks.upsertUser.mockRejectedValueOnce(new Error("db down"));
    expect((await callback.GET(callbackRequest("code=c&state=s1", { fb_oauth_state: "s1" }))).headers.get("location")).toContain("error=server_error");
  });

  it("signs out of the app and forgets respondents", async () => {
    const session = await sealSession(newSessionPayload({ userId: "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12", personId: "5099966", tokens }));
    expect((await logout.POST(new NextRequest(`${ORIGIN}/api/auth/logout`, { method: "POST", headers: { origin: "https://evil.example" } }))).status).toBe(403);
    const out = await logout.POST(new NextRequest(`${ORIGIN}/api/auth/logout`, { method: "POST", headers: { origin: ORIGIN, cookie: `${SESSION_COOKIE}=${session}` } }));
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe(`${ORIGIN}/login?signedOut=1`);
    expect(mocks.db.auditEvent.create).toHaveBeenCalled();

    const forget = await respondentLogout.POST(new NextRequest(`${ORIGIN}/api/auth/respondent/logout?returnTo=/f/recruitment`, { method: "POST", headers: { origin: ORIGIN } }));
    expect(forget.headers.get("location")).toBe(`${ORIGIN}/f/recruitment`);
    expect(forget.cookies.get(RESPONDENT_COOKIE)?.value).toBe("");
    const elsewhere = await respondentLogout.POST(new NextRequest(`${ORIGIN}/api/auth/respondent/logout?returnTo=/admin`, { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(elsewhere.headers.get("location")).toBe(`${ORIGIN}/`);
    expect(elsewhere.cookies.get(RESPONDENT_COOKIE)).toBeUndefined();
  });

  it("only allows dev login in development", async () => {
    expect((await devLogin.GET(new NextRequest(`${ORIGIN}/api/auth/dev-login`))).status).toBe(404);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN", "1");
    resetEnvCache();
    mocks.upsertUser.mockResolvedValueOnce({ id: "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b14" });
    const response = await devLogin.GET(new NextRequest(`${ORIGIN}/api/auth/dev-login?as=2&returnTo=/settings`));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/settings`);
    expect(await unsealSession(response.cookies.get(SESSION_COOKIE)?.value)).toMatchObject({ pid: "9000000002", rt: null });
  });
});

describe("Google connection routes", () => {
  const user = { id: "u1", email: "lina@example.org" };
  const aiesecGrant = { accessToken: "at", refreshToken: "rt", expiresAt: new Date(), scopes: "drive.file", sub: "123", email: "lina@aiesec.net", hostedDomain: "aiesec.net" };
  const callbackRequest = (query: string, cookies: Record<string, string> = { fb_google_state: "g1", fb_google_return_to: "/forms/abc/edit?tab=connect" }) =>
    new NextRequest(`${ORIGIN}/api/google/callback?${query}`, { headers: { cookie: Object.entries(cookies).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("; ") } });

  it("starts the Google consent flow for signed-in members", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await googleConnect.GET(new NextRequest(`${ORIGIN}/api/google/connect?returnTo=/settings`))).headers.get("location")).toContain("/login?returnTo=");
    mocks.getCurrentUser.mockResolvedValueOnce(user);
    expect((await googleConnect.GET(new NextRequest(`${ORIGIN}/api/google/connect?returnTo=/settings`))).headers.get("location")).toContain("google_error=not_configured");
    vi.stubEnv("GOOGLE_CLIENT_ID", "id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
    resetEnvCache();
    mocks.getCurrentUser.mockResolvedValueOnce(user);
    const response = await googleConnect.GET(new NextRequest(`${ORIGIN}/api/google/connect?returnTo=/settings`));
    const location = new URL(response.headers.get("location") as string);
    expect(location.host).toBe("accounts.google.com");
    expect(response.cookies.get("fb_google_state")?.value).toBeTruthy();
    // Steered to the AIESEC Workspace; a personal EXPA email is never suggested.
    expect(location.searchParams.get("hd")).toBe("aiesec.net");
    expect(location.searchParams.has("login_hint")).toBe(false);
    mocks.getCurrentUser.mockResolvedValueOnce({ ...user, email: "lina@aiesec.net" });
    expect(new URL((await googleConnect.GET(new NextRequest(`${ORIGIN}/api/google/connect`))).headers.get("location") as string).searchParams.get("login_hint")).toBe("lina@aiesec.net");
    // Their AIESEC email from EXPA is suggested even when they sign in to EXPA with a personal address.
    mocks.getCurrentUser.mockResolvedValueOnce({ ...user, email: "lina@gmail.com", workEmail: "lina.haddad@aiesec.net" });
    expect(new URL((await googleConnect.GET(new NextRequest(`${ORIGIN}/api/google/connect`))).headers.get("location") as string).searchParams.get("login_hint")).toBe("lina.haddad@aiesec.net");
    vi.stubEnv("GOOGLE_ALLOWED_DOMAINS", "*");
    resetEnvCache();
    mocks.getCurrentUser.mockResolvedValueOnce(user);
    expect(new URL((await googleConnect.GET(new NextRequest(`${ORIGIN}/api/google/connect`))).headers.get("location") as string).searchParams.has("hd")).toBe(false);
  });

  it("stores the connection and reports problems back to the page", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.exchangeGoogleCode.mockResolvedValueOnce(aiesecGrant);
    mocks.db.googleConnection.upsert.mockResolvedValueOnce({ id: "c1" });
    expect((await googleCallback.GET(callbackRequest("code=x&state=g1"))).headers.get("location")).toBe(`${ORIGIN}/forms/abc/edit?tab=connect&google=connected`);
    expect(mocks.db.googleConnection.upsert.mock.calls[0][0].create.refreshTokenEnc).not.toBe("rt");
    expect(mocks.acceptPendingInvites).toHaveBeenCalledWith(user, ["lina@aiesec.net"]);

    expect((await googleCallback.GET(callbackRequest("error=access_denied"))).headers.get("location")).toContain("google_error=denied");
    expect((await googleCallback.GET(callbackRequest("code=x&state=other"))).headers.get("location")).toContain("google_error=expired");
    expect((await googleCallback.GET(callbackRequest("state=g1"))).headers.get("location")).toContain("google_error=failed");
    mocks.exchangeGoogleCode.mockRejectedValueOnce(new GoogleAuthError("invalid", "Drive access wasn't granted"));
    expect((await googleCallback.GET(callbackRequest("code=x&state=g1"))).headers.get("location")).toContain("google_error=drive_scope");
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await googleCallback.GET(callbackRequest("code=x&state=g1"))).headers.get("location")).toContain("/login");
  });

  it("refuses personal and other-domain Google accounts, and withdraws their grant", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.exchangeGoogleCode.mockResolvedValueOnce({ ...aiesecGrant, email: "lina@gmail.com", hostedDomain: null });
    expect((await googleCallback.GET(callbackRequest("code=x&state=g1"))).headers.get("location")).toContain("google_error=domain");
    mocks.exchangeGoogleCode.mockResolvedValueOnce({ ...aiesecGrant, email: "lina@other.org", hostedDomain: "other.org" });
    expect((await googleCallback.GET(callbackRequest("code=x&state=g1"))).headers.get("location")).toContain("google_error=domain");
    expect(mocks.db.googleConnection.upsert).not.toHaveBeenCalled();
    expect(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0])).toContain("oauth2.googleapis.com/revoke");
    // Any account when the domain check is off.
    vi.stubEnv("GOOGLE_ALLOWED_DOMAINS", "*");
    resetEnvCache();
    mocks.exchangeGoogleCode.mockResolvedValueOnce({ ...aiesecGrant, email: "lina@gmail.com", hostedDomain: null });
    mocks.db.googleConnection.upsert.mockResolvedValueOnce({ id: "c2" });
    expect((await googleCallback.GET(callbackRequest("code=x&state=g1"))).headers.get("location")).toContain("google=connected");
  });
});

describe("housekeeping and health", () => {
  it("cleans up only with the cron secret", async () => {
    expect((await cron.GET(new NextRequest(`${ORIGIN}/api/cron/cleanup`))).status).toBe(401);
    expect((await cron.GET(new NextRequest(`${ORIGIN}/api/cron/cleanup`, { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    mocks.pruneRateLimits.mockResolvedValueOnce(3);
    mocks.db.form.deleteMany.mockResolvedValueOnce({ count: 2 });
    mocks.db.auditEvent.deleteMany.mockResolvedValueOnce({ count: 1 });
    mocks.db.formMessage.deleteMany.mockResolvedValueOnce({ count: 4 });
    mocks.cleanOrphanedUploads.mockResolvedValueOnce({ folders: 2, trashed: 5, failedFolders: 0 });
    const response = await cron.GET(new NextRequest(`${ORIGIN}/api/cron/cleanup`, { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(await response.json()).toEqual({ ok: true, rateLimits: 3, trashedForms: 2, auditEvents: 1, messages: 4, uploads: { folders: 2, trashed: 5, failedFolders: 0 } });
    mocks.pruneRateLimits.mockResolvedValueOnce(0);
    mocks.db.form.deleteMany.mockResolvedValueOnce({ count: 0 });
    mocks.db.auditEvent.deleteMany.mockResolvedValueOnce({ count: 0 });
    mocks.db.formMessage.deleteMany.mockResolvedValueOnce({ count: 0 });
    mocks.cleanOrphanedUploads.mockRejectedValueOnce(new Error("drive down"));
    const degraded = await cron.GET(new NextRequest(`${ORIGIN}/api/cron/cleanup`, { headers: { authorization: "Bearer test-cron-secret" } }));
    expect(await degraded.json()).toMatchObject({ uploads: { folders: 0, trashed: 0, failedFolders: 0 } });
  });

  it("reports database reachability", async () => {
    mocks.db.$queryRaw.mockResolvedValueOnce([{ "?column?": 1 }]);
    expect(await (await health.GET()).json()).toMatchObject({ ok: true, db: "up" });
    mocks.db.$queryRaw.mockRejectedValueOnce(new Error("down"));
    const down = await health.GET();
    expect(down.status).toBe(503);
  });
});
