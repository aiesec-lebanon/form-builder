import { z } from "zod";

// "Does this form look suspicious? Report" (public form footer). Reports are
// kept for platform admins; they never include the reporter's answers.

export const REPORT_REASONS = ["passwords", "phishing", "spam", "harassment", "illegal", "impersonation", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  passwords: "It asks for passwords",
  phishing: "It's trying to trick people or steal information",
  spam: "Spam or advertising",
  harassment: "Harassment, hate or bullying",
  illegal: "Illegal or harmful content",
  impersonation: "It pretends to be AIESEC or someone else",
  other: "Something else",
};

export const reportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .max(2000)
    .transform((value) => value.trim() || null)
    .nullable()
    .default(null),
  contact: z
    .union([z.literal(""), z.email().max(254)])
    .transform((value) => value || null)
    .nullable()
    .default(null),
  /** Honeypot: people never see it. */
  website: z.string().max(500).optional(),
});
export type ReportInput = z.input<typeof reportSchema>;
