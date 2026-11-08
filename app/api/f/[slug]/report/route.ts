import type { NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { hashIp } from "@/lib/crypto";
import { db } from "@/lib/db";
import { baseUrl } from "@/lib/env";
import { reportSchema } from "@/lib/forms/reports";
import { isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/http";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, userAgent } from "@/lib/request";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

/** Someone reports a published form; platform admins review it. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSameOrigin(request, new URL(baseUrl()).origin)) return jsonError(403, "forbidden", "Reports must come from the report page.");
  const read = await readJson(request, MAX_BODY_BYTES);
  if (!read.ok) return jsonError(400, "bad_request", "Something was wrong with that request.");
  const parsed = reportSchema.safeParse(read.value);
  if (!parsed.success) {
    const contactProblem = parsed.error.issues.some((issue) => issue.path[0] === "contact");
    return jsonError(422, "invalid", contactProblem ? "Enter a valid email, or leave it empty." : "Choose what's wrong with the form.");
  }

  const form = await db.form.findUnique({ where: { slug }, select: { id: true, published: true, deletedAt: true } });
  if (!form || form.deletedAt || !form.published) return jsonError(404, "not_found", "This form doesn't exist anymore.");
  // Bots fill every field; pretend all went well.
  if (parsed.data.website) return jsonOk({ reported: true });

  const ipHash = hashIp(clientIp(request.headers));
  const limit = await rateLimit(`report:${ipHash ?? "unknown"}`, 10, 3600);
  if (!limit.allowed) return jsonError(429, "rate_limited", "You've sent several reports. Try again in an hour.");

  const { reason, details, contact } = parsed.data;
  await db.formReport.create({ data: { formId: form.id, reason, details, contact, ipHash } });
  await recordAudit({ type: "form.reported", target: { type: "form", id: form.id }, metadata: { reason }, ip: clientIp(request.headers), userAgent: userAgent(request.headers) });
  logger.info("form.report_received", { formId: form.id, reason });
  return jsonOk({ reported: true });
}
