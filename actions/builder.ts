"use server";

import { Prisma } from "@prisma/client";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { getFormAccess } from "@/lib/forms/access";
import { formDocumentSchema, parseDocument, type FormDocument } from "@/lib/forms/schema";
import { logger } from "@/lib/logger";

const SIGNED_OUT = "Your session ended. Sign in again to keep editing.";
const NOT_FOUND = "This form doesn't exist or you no longer have access to it.";

/**
 * Saves the draft if nobody saved since `baseRevision` (optimistic concurrency).
 * Codes: "conflict" (someone else saved), "invalid", "signed_out", "not_found".
 */
export async function saveDraft(formId: string, rawDoc: unknown, baseRevision: number): Promise<ActionResult<{ revision: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT, { code: "signed_out" });
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return fail(NOT_FOUND, { code: "not_found" });

  const parsed = formDocumentSchema.safeParse(rawDoc);
  if (!parsed.success) {
    logger.warn("builder.invalid_draft", { formId, issues: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
    return fail("Some changes couldn't be saved. Undo your last change and try again.", { code: "invalid" });
  }
  if (!Number.isInteger(baseRevision)) return fail("Reload the page to keep editing.", { code: "invalid" });

  const doc = parsed.data;
  const updated = await db.form.updateMany({
    where: { id: formId, revision: baseRevision, deletedAt: null },
    data: { draft: doc as unknown as Prisma.InputJsonValue, title: doc.title.trim() || "Untitled form", revision: { increment: 1 } },
  });
  if (updated.count === 0) return fail("Someone else changed this form.", { code: "conflict" });
  return ok({ revision: baseRevision + 1 });
}

export async function loadLatest(formId: string): Promise<ActionResult<{ doc: FormDocument; revision: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT, { code: "signed_out" });
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return fail(NOT_FOUND, { code: "not_found" });
  const doc = parseDocument(access.form.draft);
  if (!doc) return fail("This form couldn't be loaded.", { code: "invalid" });
  return ok({ doc, revision: access.form.revision });
}
