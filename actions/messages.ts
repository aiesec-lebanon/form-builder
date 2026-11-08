"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { getFormAccess } from "@/lib/forms/access";

// The form's owner and editors manage "Contact form owner" messages (ADR-017).

const SIGNED_OUT = "Your session ended. Sign in again to continue.";
const NOT_FOUND = "This form doesn't exist or you no longer have access to it.";

async function authorize(formId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: SIGNED_OUT };
  const access = await getFormAccess(formId, user.id, "edit");
  return access ? { ok: true as const } : { ok: false as const, error: NOT_FOUND };
}

const unread = (formId: string) => db.formMessage.count({ where: { formId, readAt: null } });

/** Marks a message as read when it's opened. Returns the form's unread count. */
export async function markMessageRead(formId: string, messageId: string): Promise<ActionResult<{ unread: number }>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  await db.formMessage.updateMany({ where: { id: messageId, formId, readAt: null }, data: { readAt: new Date() } });
  return ok({ unread: await unread(formId) });
}

/** Deletes a message for everyone who edits the form. */
export async function deleteMessage(formId: string, messageId: string): Promise<ActionResult<{ unread: number }>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  await db.formMessage.deleteMany({ where: { id: messageId, formId } });
  return ok({ unread: await unread(formId) });
}
