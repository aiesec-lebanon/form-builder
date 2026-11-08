import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getFormAccess: vi.fn(),
  db: { formMessage: { updateMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn() } },
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser }));
vi.mock("@/lib/forms/access", () => ({ getFormAccess: m.getFormAccess }));
vi.mock("@/lib/db", () => ({ db: m.db }));

const actions = await import("@/actions/messages");
const { validateMessage } = await import("@/lib/forms/messages");

beforeEach(() => {
  m.getCurrentUser.mockResolvedValue({ id: "u1" });
  m.getFormAccess.mockResolvedValue({ form: { id: "form-1" }, role: "editor" });
  m.db.formMessage.count.mockResolvedValue(2);
});
afterEach(() => vi.clearAllMocks());

describe("message validation", () => {
  it("needs a name, an email, a subject and a message from everyone", () => {
    expect(validateMessage({ name: " Lina ", email: "lina@example.org", subject: " Hi ", message: " Hello " })).toEqual({ ok: true, data: { name: "Lina", email: "lina@example.org", subject: "Hi", message: "Hello" } });
    expect(validateMessage({ name: "Lina", subject: "Hi", message: "Hello" })).toEqual({ ok: false, fieldErrors: { email: "Enter your email so the owner can reply." } });
    expect(validateMessage(null)).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String), email: expect.any(String), subject: expect.any(String), message: expect.any(String) } });
    expect(validateMessage({ name: 42 })).toEqual({ ok: false, fieldErrors: { message: "Something was wrong with that message. Try again." } });
  });
});

describe("owner actions", () => {
  it("marks a message read and returns the unread count", async () => {
    expect(await actions.markMessageRead("form-1", "msg-1")).toEqual({ ok: true, data: { unread: 2 } });
    expect(m.db.formMessage.updateMany).toHaveBeenCalledWith({ where: { id: "msg-1", formId: "form-1", readAt: null }, data: { readAt: expect.any(Date) } });
  });

  it("deletes a message of this form only", async () => {
    expect(await actions.deleteMessage("form-1", "msg-1")).toEqual({ ok: true, data: { unread: 2 } });
    expect(m.db.formMessage.deleteMany).toHaveBeenCalledWith({ where: { id: "msg-1", formId: "form-1" } });
  });

  it("refuses people without edit access", async () => {
    m.getCurrentUser.mockResolvedValueOnce(null);
    expect(await actions.markMessageRead("form-1", "msg-1")).toMatchObject({ ok: false, error: expect.stringContaining("Sign in") });
    m.getFormAccess.mockResolvedValueOnce(null);
    expect(await actions.deleteMessage("form-1", "msg-1")).toMatchObject({ ok: false });
    expect(m.db.formMessage.deleteMany).not.toHaveBeenCalled();
  });
});

describe("replying from Gmail", () => {
  it("opens Gmail compose as the owner, addressed to the sender, with the message quoted", async () => {
    const { gmailReplyUrl } = await import("@/lib/forms/messages");
    const url = new URL(gmailReplyUrl({ senderName: "Lina Haddad", senderEmail: "lina@example.org", subject: "Deadline & dates", body: "Line one\nLine two" }, "owner@aiesec.net"));
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(Object.fromEntries(url.searchParams)).toEqual({ authuser: "owner@aiesec.net", view: "cm", fs: "1", to: "lina@example.org", su: "Re: Deadline & dates", body: "\n\nLina Haddad wrote:\n> Line one\n> Line two" });
    expect(new URL(gmailReplyUrl({ senderName: "A", senderEmail: "a@b.org", subject: "S", body: "x".repeat(5000) }, null)).searchParams.has("authuser")).toBe(false);
  });
});
