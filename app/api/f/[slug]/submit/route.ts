import { after, type NextRequest } from "next/server";
import { z } from "zod";

import { hashIp } from "@/lib/crypto";
import { db } from "@/lib/db";
import { deliverToPrimary, deliverToSecondaries } from "@/lib/destinations/deliver";
import { baseUrl } from "@/lib/env";
import { availability } from "@/lib/forms/availability";
import { validateAnswers } from "@/lib/forms/fields";
import { buildPayload } from "@/lib/forms/payload";
import { visibleFields } from "@/lib/forms/logic";
import { verifyRenderToken } from "@/lib/forms/render-token";
import { accessProblem, claimResponse, currentRespondent, releaseResponse } from "@/lib/forms/respondents";
import { parseDocument } from "@/lib/forms/schema";
import { isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/http";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { verifyTurnstile } from "@/lib/turnstile";
import { resolveUploadedFiles } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

const CLOSED_MESSAGES = {
  closed: "This form is no longer accepting responses.",
  expired: "This form has closed.",
  full: "This form has reached its response limit.",
} as const;

const bodySchema = z.object({
  responseId: z.string().uuid(),
  renderToken: z.string().max(300),
  answers: z.record(z.string().max(32), z.unknown()),
  website: z.string().max(500).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

/**
 * Accepts one response and hands it straight to the form's destinations
 * (spec §10). Answers are never stored or logged here.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const started = Date.now();
  const { slug } = await params;
  if (!isSameOrigin(request, new URL(baseUrl()).origin)) return jsonError(403, "forbidden", "Responses must come from the form page.");

  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return read.reason === "too_large" ? jsonError(413, "too_large", "Your answers are too long to send. Shorten them and try again.") : jsonError(400, "bad_request", "Something was wrong with that request.");
  const parsed = bodySchema.safeParse(read.value);
  if (!parsed.success) return jsonError(400, "bad_request", "Something was wrong with that request. Reload the page and try again.");
  const body = parsed.data;

  const form = await db.form.findUnique({
    where: { slug },
    select: { id: true, slug: true, published: true, acceptingResponses: true, closesAt: true, responseLimit: true, responseCount: true, deletedAt: true },
  });
  if (!form || form.deletedAt || !form.published) return jsonError(404, "not_found", "This form doesn't exist anymore.");
  const open = availability(form);
  if (!open.open) return jsonError(410, "closed", CLOSED_MESSAGES[open.reason], { reason: open.reason });

  // Bots fill every field; people never see this one. Pretend all went well.
  if (body.website) {
    logger.info("submit.honeypot", { formId: form.id });
    return jsonOk({ responseId: body.responseId });
  }

  const token = verifyRenderToken(body.renderToken, form.id);
  if (!token.ok) {
    return token.reason === "too_fast" ? jsonError(429, "rate_limited", "That was quick. Wait a moment, then send again.", { error: "too_fast" }) : jsonError(403, "forbidden", "Reload the page, then send again.", { error: "invalid_token" });
  }

  const ipKey = hashIp(clientIp(request.headers)) ?? "unknown";
  const [perVisitor, perForm] = await Promise.all([rateLimit(`submit:${form.id}:${ipKey}`, 60, 600), rateLimit(`submit:${form.id}`, 1000, 600)]);
  if (!perVisitor.allowed || !perForm.allowed) {
    logger.warn("submit.rate_limited", { formId: form.id, scope: perVisitor.allowed ? "form" : "visitor" });
    return jsonError(429, "rate_limited", "Too many responses right now. Wait a minute, then try again.");
  }

  // Bot check (ADR-012), after the cheap checks. The response id lets a retry re-verify the same token.
  const human = await verifyTurnstile({ token: body.turnstileToken, ip: clientIp(request.headers), idempotencyKey: body.responseId });
  if (!human.ok) return jsonError(403, "forbidden", "Complete the check above the send button, then send again.", { error: "bot_check" });

  const doc = parseDocument(form.published);
  if (!doc) {
    logger.error("submit.unreadable_form", { formId: form.id });
    return jsonError(500, "server_error", "This form can't take responses right now.");
  }

  // AIESEC-only forms (ADR-013): the page gates people, and so does this endpoint.
  const access = doc.settings.access;
  const respondent = access.mode === "aiesec" ? await currentRespondent() : null;
  const problem = accessProblem(access, respondent, false);
  if (problem === "sign_in") return jsonError(401, "unauthorized", "Sign in with AIESEC to send this form.", { error: "sign_in_required" });
  if (problem === "members_only") return jsonError(403, "forbidden", "This form is for current AIESEC members.", { error: "members_only" });

  // Only questions visible for these answers count (ADR-009); hidden ones are sent as null.
  const fields = visibleFields(doc, body.answers);
  const validation = validateAnswers(fields, body.answers);
  if (!validation.ok) return jsonError(422, "invalid", "Some answers need fixing.", { fieldErrors: validation.errors });

  const values = { ...validation.values };
  const fileFields = fields.filter((field) => field.type === "file_upload" && values[field.id]);
  if (fileFields.length > 0) {
    const files = await resolveUploadedFiles({ formId: form.id, responseId: body.responseId, fields: fileFields, values });
    if (!files.ok) {
      if (files.status === 422) return jsonError(422, "invalid", "Some uploads need fixing.", { fieldErrors: files.fieldErrors });
      logger.warn("submit.files_unverified", { formId: form.id, reason: files.message });
      return jsonError(502, "delivery_failed", files.message);
    }
    Object.assign(values, files.values);
  }

  // One response per person: claim it before delivering, give it back if delivery fails.
  const claimed = Boolean(respondent && access.onePerPerson);
  if (respondent && claimed && !(await claimResponse(form.id, respondent.aiesecId, body.responseId))) {
    return jsonError(409, "forbidden", "You've already responded to this form.", { error: "already_responded" });
  }

  const recorded = respondent ? { aiesecId: respondent.aiesecId, name: respondent.name, email: respondent.email } : null;
  const payload = buildPayload({ responseId: body.responseId, submittedAt: new Date(), form: { id: form.id, slug: form.slug }, doc, values, respondent: recorded });
  const context = { payload, doc, values };
  const outcome = await deliverToPrimary(form.id, context);
  if (!outcome.ok) {
    if (respondent && claimed) await releaseResponse(form.id, respondent.aiesecId, body.responseId).catch((error) => logger.warn("submit.release_failed", { formId: form.id, error }));
    logger.warn("submit.delivery_failed", { formId: form.id, retryable: outcome.retryable, ms: Date.now() - started });
    return jsonError(502, "delivery_failed", "We couldn't send your response just now. Your answers are saved on this device, so you can try again.");
  }

  await db.form.update({ where: { id: form.id }, data: { responseCount: { increment: 1 }, lastResponseAt: new Date() } }).catch((error) => logger.warn("submit.count_failed", { formId: form.id, error }));
  if (outcome.secondaries.length > 0) after(() => deliverToSecondaries(outcome.secondaries, context));

  logger.info("submit.accepted", { formId: form.id, ms: Date.now() - started });
  return jsonOk({ responseId: body.responseId });
}
