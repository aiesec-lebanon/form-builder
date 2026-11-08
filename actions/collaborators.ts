"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { getFormAccess } from "@/lib/forms/access";
import { loadCollaboration, type Collaboration } from "@/lib/forms/collaboration";
import { clientIp, userAgent } from "@/lib/request";

const MAX_PEOPLE = 25;
const SIGNED_OUT = "Your session ended. Sign in again to continue.";
const NOT_FOUND = "This form doesn't exist or you no longer have access to it.";
const OWNER_ONLY = "Only the form's owner can change who has access.";

async function meta() {
  const list = await headers();
  return { ip: clientIp(list), userAgent: userAgent(list) };
}

async function refreshed(formId: string, viewerId: string): Promise<ActionResult<Collaboration>> {
  const collaboration = await loadCollaboration(formId, viewerId);
  return collaboration ? ok(collaboration) : fail(NOT_FOUND);
}

const identifierSchema = z.string().trim().min(1, "Enter an email address or EXPA ID.").max(254);

export async function addCollaborator(formId: string, rawIdentifier: string): Promise<ActionResult<Collaboration>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "own");
  if (!access) return fail(OWNER_ONLY);
  const parsed = identifierSchema.safeParse(rawIdentifier);
  if (!parsed.success) return fail(parsed.error.issues[0].message, { fieldErrors: { identifier: parsed.error.issues[0].message } });
  const identifier = parsed.data.toLowerCase();

  const [editorCount, inviteCount] = await Promise.all([db.formCollaborator.count({ where: { formId } }), db.formInvite.count({ where: { formId } })]);
  if (editorCount + inviteCount >= MAX_PEOPLE) return fail(`A form can be shared with up to ${MAX_PEOPLE} people.`);

  const isPersonId = /^\d{1,15}$/.test(identifier);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(identifier);
  if (!isPersonId && !isEmail) return fail("Enter an email address or an EXPA ID (numbers only).", { fieldErrors: { identifier: "Enter an email address or an EXPA ID (numbers only)." } });

  const target = isPersonId ? await db.user.findUnique({ where: { aiesecPersonId: BigInt(identifier) } }) : await db.user.findFirst({ where: { OR: [{ email: identifier }, { googleConnections: { some: { email: identifier } } }] } });
  if (target?.id === access.form.ownerId) return fail("That's the form's owner. They already have access.");

  if (target) {
    await db.formCollaborator.upsert({
      where: { formId_userId: { formId, userId: target.id } },
      create: { formId, userId: target.id, addedById: user.id },
      update: {},
    });
    await recordAudit({ type: "collaborator.added", actorId: user.id, target: { type: "form", id: formId }, metadata: { collaboratorId: target.id }, ...(await meta()) });
  } else if (isEmail) {
    await db.formInvite.upsert({ where: { formId_email: { formId, email: identifier } }, create: { formId, email: identifier, invitedById: user.id }, update: {} });
    await recordAudit({ type: "collaborator.added", actorId: user.id, target: { type: "form", id: formId }, metadata: { invited: true }, ...(await meta()) });
  } else {
    return fail("That person hasn't signed in to AIESEC Forms yet. Invite them by email instead.", { fieldErrors: { identifier: "Not signed in yet. Use their email address." } });
  }
  revalidatePath(`/forms/${formId}/edit`);
  return refreshed(formId, user.id);
}

/** Owners remove anyone; editors may remove themselves ("leave"). */
export async function removeCollaborator(formId: string, userId: string): Promise<ActionResult<Collaboration | { left: true }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const leaving = userId === user.id;
  const access = await getFormAccess(formId, user.id, leaving ? "edit" : "own");
  if (!access) return fail(leaving ? NOT_FOUND : OWNER_ONLY);
  if (leaving && access.role === "owner") return fail("Transfer ownership before leaving your own form.");
  await db.formCollaborator.deleteMany({ where: { formId, userId } });
  await recordAudit({ type: "collaborator.removed", actorId: user.id, target: { type: "form", id: formId }, metadata: { collaboratorId: userId, left: leaving }, ...(await meta()) });
  revalidatePath("/forms");
  if (leaving) return ok({ left: true as const });
  return refreshed(formId, user.id);
}

export async function revokeInvite(formId: string, inviteId: string): Promise<ActionResult<Collaboration>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "own");
  if (!access) return fail(OWNER_ONLY);
  await db.formInvite.deleteMany({ where: { id: inviteId, formId } });
  return refreshed(formId, user.id);
}

/** Handover: the editor becomes owner; the previous owner stays as an editor. */
export async function transferOwnership(formId: string, newOwnerId: string): Promise<ActionResult<Collaboration>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "own");
  if (!access) return fail(OWNER_ONLY);
  const editor = await db.formCollaborator.findUnique({ where: { formId_userId: { formId, userId: newOwnerId } } });
  if (!editor) return fail("Add this person as an editor first.");

  await db.$transaction([
    db.form.update({ where: { id: formId }, data: { ownerId: newOwnerId } }),
    db.formCollaborator.delete({ where: { formId_userId: { formId, userId: newOwnerId } } }),
    db.formCollaborator.create({ data: { formId, userId: user.id, addedById: newOwnerId } }),
  ]);
  await recordAudit({ type: "form.ownership_transferred", actorId: user.id, target: { type: "form", id: formId }, metadata: { newOwnerId }, ...(await meta()) });
  revalidatePath("/forms");
  return refreshed(formId, user.id);
}
