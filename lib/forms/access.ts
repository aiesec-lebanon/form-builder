import "server-only";

import type { Form } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";

// Authorization for forms (ADR-005: enforced in code, not by RLS).
// "edit": owner or collaborator. "own": owner only (delete, transfer, collaborators).

export type AccessLevel = "edit" | "own";
export type FormAccess = { form: Form; role: "owner" | "editor" };

const uuid = z.string().uuid();

export async function getFormAccess(formId: string, userId: string, level: AccessLevel, options: { includeTrashed?: boolean } = {}): Promise<FormAccess | null> {
  if (!uuid.safeParse(formId).success) return null;
  const form = await db.form.findFirst({
    where: {
      id: formId,
      ...(options.includeTrashed ? {} : { deletedAt: null }),
      ...(level === "own" ? { ownerId: userId } : { OR: [{ ownerId: userId }, { collaborators: { some: { userId } } }] }),
    },
  });
  if (!form) return null;
  return { form, role: form.ownerId === userId ? "owner" : "editor" };
}
