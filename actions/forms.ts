"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getFormAccess } from "@/lib/forms/access";
import { parseDocument, type FormDocument } from "@/lib/forms/schema";
import { generateSlug } from "@/lib/forms/slug";
import { templateDocument, type TemplateId } from "@/lib/forms/templates";
import { clientIp, userAgent } from "@/lib/request";

const SIGNED_OUT = "Your session ended. Sign in again to continue.";
const NOT_FOUND = "This form doesn't exist or you no longer have access to it.";

async function requestMeta() {
  const list = await headers();
  return { ip: clientIp(list), userAgent: userAgent(list) };
}

/** Inserts a form with a fresh unique slug (retries the rare collision). */
async function insertForm(ownerId: string, doc: FormDocument) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await db.form.create({
        data: { ownerId, title: doc.title, slug: generateSlug(), draft: doc as unknown as Prisma.InputJsonValue },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("Could not allocate a unique slug");
}

const templateIdSchema = z.enum(["blank", "event", "feedback", "contact", "membership"]);

/** Creates a form from a template and opens it in the builder. */
export async function createForm(templateId: TemplateId): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const parsed = templateIdSchema.safeParse(templateId);
  if (!parsed.success) return fail("Choose a template.");

  let formId: string;
  try {
    const form = await insertForm(user.id, templateDocument(parsed.data));
    formId = form.id;
  } catch (error) {
    logger.error("form.create_failed", { error });
    return fail("We couldn't create the form. Try again.");
  }
  await recordAudit({ type: "form.created", actorId: user.id, target: { type: "form", id: formId }, metadata: { template: parsed.data }, ...(await requestMeta()) });
  redirect(`/forms/${formId}/edit`);
}

export async function duplicateForm(formId: string): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return fail(NOT_FOUND);

  const doc = parseDocument(access.form.draft);
  if (!doc) return fail("This form couldn't be copied.");
  const copy = { ...doc, title: `Copy of ${doc.title || "Untitled form"}`.slice(0, 200) };
  try {
    const form = await insertForm(user.id, copy);
    await recordAudit({ type: "form.created", actorId: user.id, target: { type: "form", id: form.id }, metadata: { duplicatedFrom: formId }, ...(await requestMeta()) });
    revalidatePath("/forms");
    return ok({ id: form.id });
  } catch (error) {
    logger.error("form.duplicate_failed", { formId, error });
    return fail("We couldn't copy the form. Try again.");
  }
}

export async function trashForm(formId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "own");
  if (!access) return fail("Only the form's owner can move it to the trash.");
  await db.form.update({ where: { id: formId }, data: { deletedAt: new Date() } });
  await recordAudit({ type: "form.trashed", actorId: user.id, target: { type: "form", id: formId }, ...(await requestMeta()) });
  revalidatePath("/forms");
  return ok();
}

export async function restoreForm(formId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "own", { includeTrashed: true });
  if (!access) return fail(NOT_FOUND);
  await db.form.update({ where: { id: formId }, data: { deletedAt: null } });
  await recordAudit({ type: "form.restored", actorId: user.id, target: { type: "form", id: formId }, ...(await requestMeta()) });
  revalidatePath("/forms");
  return ok();
}
