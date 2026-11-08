import type { NextRequest } from "next/server";

import { hashIp } from "@/lib/crypto";
import { db } from "@/lib/db";
import { baseUrl } from "@/lib/env";
import { validateMessage } from "@/lib/forms/messages";
import { currentRespondent } from "@/lib/forms/respondents";
import { isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/http";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

/**
 * "Contact form owner" (ADR-017): stores a message for the form's owner and
 * editors, who read it in the builder. The owner's email is never revealed;
 * the sender's name and email travel with the message so the owner can reply.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSameOrigin(request, new URL(baseUrl()).origin)) return jsonError(403, "forbidden", "Messages must come from the form page.");
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.reason === "too_large" ? jsonError(413, "too_large", "Your message is too long. Shorten it and try again.") : jsonError(400, "bad_request", "Something was wrong with that request.");

  const form = await db.form.findUnique({ where: { slug }, select: { id: true, published: true, deletedAt: true } });
  if (!form || form.deletedAt || !form.published) return jsonError(404, "not_found", "This form doesn't exist anymore.");

  // Bots fill every field; people never see this one. Pretend all went well.
  const raw = read.value as { website?: unknown } | null;
  if (raw && typeof raw.website === "string" && raw.website) return jsonOk({ sent: true });

  // Signed in with AIESEC: name and email come from the sign-in, not the form.
  const sender = await currentRespondent();
  const known = { name: Boolean(sender?.name), email: Boolean(sender?.email) };
  const checked = validateMessage(read.value, known);
  if (!checked.ok) return jsonError(422, "invalid", "Some fields need fixing.", { fieldErrors: checked.fieldErrors });

  const ip = clientIp(request.headers);
  const ipHash = hashIp(ip);
  const [perForm, perVisitor] = await Promise.all([rateLimit(`message:${form.id}:${ipHash ?? "unknown"}`, 5, 3600), rateLimit(`message:${ipHash ?? "unknown"}`, 20, 3600)]);
  if (!perForm.allowed || !perVisitor.allowed) return jsonError(429, "rate_limited", "You've sent several messages. Try again in an hour.");

  const human = await verifyTurnstile({ token: checked.data.turnstileToken, ip, idempotencyKey: crypto.randomUUID() });
  if (!human.ok) return jsonError(403, "forbidden", "Complete the check above the button, then send again.", { error: "bot_check" });

  const verified = known.name && known.email;
  await db.formMessage.create({
    data: {
      formId: form.id,
      senderName: sender?.name ? sender.name.slice(0, 100) : checked.data.name,
      senderEmail: sender?.email ?? checked.data.email,
      subject: checked.data.subject,
      body: checked.data.message,
      verified,
      ipHash,
    },
  });
  logger.info("form.message_received", { formId: form.id, verified });
  return jsonOk({ sent: true });
}
