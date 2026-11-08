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

/**
 * Checks a message. Name and email are only needed when the sender isn't
 * signed in with AIESEC (then they come from the sign-in instead).
 */
export function validateMessage(raw: unknown, known: { name: boolean; email: boolean }): { ok: true; data: MessageInput } | { ok: false; fieldErrors: Partial<Record<MessageField, string>> } {
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
  if (!known.name && !data.name) fieldErrors.name = "Enter your name.";
  if (!known.email) {
    if (!data.email) fieldErrors.email = "Enter your email so the owner can reply.";
    else if (!z.email().safeParse(data.email).success) fieldErrors.email = "Enter an email like name@example.com.";
  }
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
  verified: boolean;
  createdAt: string;
  readAt: string | null;
};
