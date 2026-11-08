import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { MESSAGE_RETENTION_DAYS } from "@/lib/forms/messages";
import { logger } from "@/lib/logger";
import { pruneRateLimits } from "@/lib/rate-limit";
import { cleanOrphanedUploads } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const TRASH_DAYS = 30;
const AUDIT_DAYS = 365;
const day = 24 * 60 * 60 * 1000;

/** Daily housekeeping, called by the GitHub Actions workflow .github/workflows/cleanup.yml with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const presented = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!presented || !safeEqual(presented, env().CRON_SECRET)) return new NextResponse(null, { status: 401 });

  const started = Date.now();
  const [rateLimits, trashedForms, auditEvents, messages] = await Promise.all([
    pruneRateLimits(),
    db.form.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - TRASH_DAYS * day) } } }).then((result) => result.count),
    db.auditEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - AUDIT_DAYS * day) } } }).then((result) => result.count),
    db.formMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - MESSAGE_RETENTION_DAYS * day) } } }).then((result) => result.count),
  ]);
  // Google calls are slower; after the database work, never failing the run.
  const uploads = await cleanOrphanedUploads().catch((error) => {
    logger.warn("cron.uploads_failed", { error });
    return { folders: 0, trashed: 0, failedFolders: 0 };
  });
  logger.info("cron.cleanup", { rateLimits, trashedForms, auditEvents, messages, uploads, ms: Date.now() - started });
  return NextResponse.json({ ok: true, rateLimits, trashedForms, auditEvents, messages, uploads });
}
