import "server-only";

import type { User } from "@prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

import { activePositions, type GisPerson } from "./gis";

// Persisting who signed in, and turning pending email invites into editor access.

export function profileFromPerson(person: GisPerson) {
  const positions = activePositions(person);
  const primary = positions[0];
  const email = person.email?.trim().toLowerCase() || null;
  const officeId = person.current_office?.id ?? primary?.office?.id ?? null;
  return {
    fullName: person.full_name?.trim() || `Member ${person.id}`,
    email,
    photoUrl: person.profile_photo?.startsWith("https://") ? person.profile_photo : null,
    officeId: officeId && /^\d+$/.test(officeId) ? BigInt(officeId) : null,
    officeName: person.current_office?.name ?? primary?.office?.name ?? null,
    positionTitle: primary?.title ?? primary?.role?.name ?? null,
  };
}

export async function upsertUser(personId: string, profile: ReturnType<typeof profileFromPerson>): Promise<User> {
  const now = new Date();
  return db.user.upsert({
    where: { aiesecPersonId: BigInt(personId) },
    create: { aiesecPersonId: BigInt(personId), ...profile, lastSignInAt: now },
    update: { ...profile, lastSignInAt: now },
  });
}

/**
 * Every address we know for a person: the EXPA email (often personal) and the
 * Google accounts they connected (their AIESEC work email).
 */
export async function knownEmails(user: Pick<User, "id" | "email">): Promise<string[]> {
  const connections = await db.googleConnection.findMany({ where: { userId: user.id }, select: { email: true } });
  return [...new Set([user.email, ...connections.map((connection) => connection.email)].filter((email): email is string => Boolean(email)).map((email) => email.toLowerCase()))];
}

/** Converts invites addressed to any of the user's emails into editor access. Returns how many. */
export async function acceptPendingInvites(user: Pick<User, "id" | "email">, emails?: string[]): Promise<number> {
  const addresses = emails ?? (await knownEmails(user));
  if (addresses.length === 0) return 0;
  const invites = await db.formInvite.findMany({
    where: { email: { in: addresses }, form: { deletedAt: null } },
    select: { id: true, formId: true, invitedById: true, form: { select: { ownerId: true } } },
  });
  let accepted = 0;
  for (const invite of invites) {
    try {
      await db.$transaction(async (tx) => {
        if (invite.form.ownerId !== user.id) {
          await tx.formCollaborator.upsert({
            where: { formId_userId: { formId: invite.formId, userId: user.id } },
            create: { formId: invite.formId, userId: user.id, addedById: invite.invitedById },
            update: {},
          });
          accepted += 1;
        }
        await tx.formInvite.delete({ where: { id: invite.id } });
      });
    } catch (error) {
      logger.warn("invite.accept_failed", { inviteId: invite.id, error });
    }
  }
  return accepted;
}
