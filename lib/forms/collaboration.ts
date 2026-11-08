import "server-only";

import { db } from "@/lib/db";

// Who has access to a form. Not a Server Action: callers must authorize first.

export type Person = { id: string; name: string; email: string | null; photoUrl: string | null; detail: string | null };
export type Collaboration = { owner: Person; editors: Person[]; invites: Array<{ id: string; email: string }>; viewerIsOwner: boolean; viewerId: string };

type UserRow = { id: string; fullName: string; email: string | null; aiesecEmail: string | null; photoUrl: string | null; positionTitle: string | null; officeName: string | null };

function person(user: UserRow): Person {
  return { id: user.id, name: user.fullName, email: user.aiesecEmail ?? user.email, photoUrl: user.photoUrl, detail: [user.positionTitle, user.officeName].filter(Boolean).join(" · ") || null };
}

export async function loadCollaboration(formId: string, viewerId: string): Promise<Collaboration | null> {
  const form = await db.form.findUnique({
    where: { id: formId },
    select: {
      owner: true,
      collaborators: { include: { user: true }, orderBy: { createdAt: "asc" } },
      invites: { select: { id: true, email: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!form) return null;
  return {
    owner: person(form.owner),
    editors: form.collaborators.map((entry) => person(entry.user)),
    invites: form.invites,
    viewerIsOwner: form.owner.id === viewerId,
    viewerId,
  };
}
