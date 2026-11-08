import { z } from "zod";

// "Contact form owner" messages (ADR-017): what a sender may send, and the
// errors they see. The owner's email is never part of this.

export const MESSAGE_LIMITS = { name: 100, email: 254, subject: 150, body: 4000 } as const;
/** The daily cron deletes messages older than this. */
export const MESSAGE_RETENTION_DAYS = 365;

export type MessageField = "name" | "email" | "subject" | "message";
export type MessageInput = { name: string; email: string; subject: string; message: string; website?: string; turnstileToken?: string };

const shape = z.object({
  name: z.string().max(MESSAGE_LIMITS.name).default(""),
  email: z.string().max(MESSAGE_LIMITS.email).default(""),
  subject: z.string().max(MESSAGE_LIMITS.subject).default(""),
  message: z.string().max(MESSAGE_LIMITS.body).default(""),
  /** Honeypot: people never see it. */
  website: z.string().max(500).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

const TOO_LONG: Record<MessageField, string> = {
  name: `Use ${MESSAGE_LIMITS.name} characters or fewer.`,
  email: "Use a shorter email address.",
  subject: `Keep the subject to ${MESSAGE_LIMITS.subject} characters.`,
  message: `Keep the message to ${MESSAGE_LIMITS.body} characters.`,
};

/** Checks a message. Everyone gives the name and email the owner should reply to. */
export function validateMessage(raw: unknown): { ok: true; data: MessageInput } | { ok: false; fieldErrors: Partial<Record<MessageField, string>> } {
  const parsed = shape.safeParse(raw ?? {});
  if (!parsed.success) {
    const fieldErrors: Partial<Record<MessageField, string>> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as MessageField;
      if (issue.code === "too_big" && key in TOO_LONG) fieldErrors[key] ??= TOO_LONG[key];
    }
    return { ok: false, fieldErrors: Object.keys(fieldErrors).length ? fieldErrors : { message: "Something was wrong with that message. Try again." } };
  }
  const data = { ...parsed.data, name: parsed.data.name.trim(), email: parsed.data.email.trim(), subject: parsed.data.subject.trim(), message: parsed.data.message.trim() };
  const fieldErrors: Partial<Record<MessageField, string>> = {};
  if (!data.name) fieldErrors.name = "Enter your name.";
  if (!data.email) fieldErrors.email = "Enter your email so the owner can reply.";
  else if (!z.email().safeParse(data.email).success) fieldErrors.email = "Enter an email like name@example.com.";
  if (!data.subject) fieldErrors.subject = "Add a subject.";
  if (!data.message) fieldErrors.message = "Write your message.";
  return Object.keys(fieldErrors).length ? { ok: false, fieldErrors } : { ok: true, data };
}

/** What the builder shows for one message. */
export type MessageSummary = {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

/**
 * Gmail's compose window, signed in as the owner (authuser), addressed to the
 * sender, with the subject and their message quoted. Opens in a new tab.
 */
export function gmailReplyUrl(message: Pick<MessageSummary, "senderName" | "senderEmail" | "subject" | "body">, from: string | null): string {
  const quoted = message.body
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
    .slice(0, 1500);
  const params: Array<[string, string]> = [
    ["view", "cm"],
    ["fs", "1"],
    ["to", message.senderEmail],
    ["su", `Re: ${message.subject}`],
    ["body", `\n\n${message.senderName} wrote:\n${quoted}`],
  ];
  if (from) params.unshift(["authuser", from]);
  return `https://mail.google.com/mail/?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&")}`;
}
