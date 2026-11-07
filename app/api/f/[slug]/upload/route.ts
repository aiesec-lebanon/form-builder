import type { NextRequest } from "next/server";
import { z } from "zod";

import { hashIp } from "@/lib/crypto";
import { db } from "@/lib/db";
import { classifyError } from "@/lib/destinations/errors";
import { baseUrl } from "@/lib/env";
import { bytesFromMb, fileTypeAllowed } from "@/lib/forms/fields/other";
import { allFields, parseDocument } from "@/lib/forms/schema";
import { startResumableUpload } from "@/lib/google/api";
import { googleAccessToken } from "@/lib/google/tokens";
import { isSameOrigin, jsonError, jsonOk, readJson } from "@/lib/http";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { driveFileName, filesDestination } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fieldId: z.string().max(32),
  responseId: z.string().uuid(),
  name: z.string().min(1).max(255),
  size: z.number().int().min(0),
  mimeType: z.string().max(255),
});

/** Opens a Drive resumable upload the browser completes itself (ADR-004). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const origin = new URL(baseUrl()).origin;
  if (!isSameOrigin(request, origin)) return jsonError(403, "forbidden", "Uploads must come from the form page.");

  const read = await readJson(request, 4 * 1024);
  if (!read.ok) return jsonError(400, "bad_request", "Something was wrong with that upload.");
  const parsed = bodySchema.safeParse(read.value);
  if (!parsed.success) return jsonError(400, "bad_request", "Something was wrong with that upload.");
  const body = parsed.data;

  const form = await db.form.findUnique({ where: { slug }, select: { id: true, published: true, acceptingResponses: true, deletedAt: true } });
  if (!form || form.deletedAt || !form.published) return jsonError(404, "not_found", "This form doesn't exist anymore.");
  if (!form.acceptingResponses) return jsonError(410, "closed", "This form is no longer accepting responses.");

  const doc = parseDocument(form.published);
  const field = doc ? allFields(doc).find((item) => item.id === body.fieldId) : undefined;
  if (!field || field.type !== "file_upload") return jsonError(400, "bad_request", "That question doesn't take files.");
  if (body.size > bytesFromMb(field.maxSizeMb)) return jsonError(422, "invalid", `Each file can be up to ${field.maxSizeMb} MB.`);
  if (!fileTypeAllowed(field.accept, body.mimeType)) return jsonError(422, "invalid", "That file type isn't accepted here.");

  const ipKey = hashIp(clientIp(request.headers)) ?? "unknown";
  const limit = await rateLimit(`upload:${form.id}:${ipKey}`, 100, 600);
  if (!limit.allowed) return jsonError(429, "rate_limited", "Too many uploads right now. Wait a minute, then try again.");

  const storage = await filesDestination(form.id);
  if (!storage) return jsonError(503, "upload_failed", "File uploads aren't set up for this form. Let the person who shared it know.");

  try {
    const token = await googleAccessToken(storage.connectionId);
    const uploadUrl = await startResumableUpload(token, {
      folderId: storage.folderId,
      name: driveFileName(body.responseId, body.name),
      mimeType: body.mimeType,
      size: body.size,
      origin,
      appProperties: { aiesecForms: "1", formId: form.id, responseId: body.responseId, fieldId: field.id },
    });
    return jsonOk({ uploadUrl });
  } catch (error) {
    logger.warn("upload.start_failed", { formId: form.id, error });
    const result = classifyError(error);
    return jsonError(502, "upload_failed", result.ok ? "We couldn't start the upload. Try again." : "We couldn't start the upload. Try again in a moment.");
  }
}
