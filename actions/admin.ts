"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";

// Platform admins act on reported forms (footer "Report").

const NOT_ALLOWED = "Only platform admins can do this.";

async function admin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

/** Stops a reported form from taking responses and marks its open reports reviewed. */
export async function closeReportedForm(formId: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return fail(NOT_ALLOWED);
  const updated = await db.form.updateMany({ where: { id: formId, deletedAt: null }, data: { acceptingResponses: false } });
  if (updated.count === 0) return fail("This form doesn't exist anymore.");
  await db.formReport.updateMany({ where: { formId, reviewedAt: null }, data: { reviewedAt: new Date() } });
  await recordAudit({ type: "form.closed", actorId: user.id, target: { type: "form", id: formId }, metadata: { reason: "report" } });
  revalidatePath("/admin/activity");
  return ok();
}

/** Marks a report as looked at without closing the form. */
export async function markReportReviewed(reportId: string): Promise<ActionResult> {
  const user = await admin();
  if (!user) return fail(NOT_ALLOWED);
  const updated = await db.formReport.updateMany({ where: { id: reportId, reviewedAt: null }, data: { reviewedAt: new Date() } });
  if (updated.count > 0) await recordAudit({ type: "form.report_reviewed", actorId: user.id, metadata: { reportId } });
  revalidatePath("/admin/activity");
  return ok();
}
