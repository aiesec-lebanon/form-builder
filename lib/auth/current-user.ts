import "server-only";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/lib/db";

import { isPlatformAdmin } from "./policy";
import { SESSION_COOKIE, unsealSession } from "./session";

export type CurrentUser = {
  id: string;
  aiesecPersonId: string;
  fullName: string;
  email: string | null;
  /** Their AIESEC work email: from EXPA, or else the AIESEC Google account they connected. */
  workEmail: string | null;
  photoUrl: string | null;
  officeName: string | null;
  positionTitle: string | null;
  isAdmin: boolean;
};

/** The unsealed session for this request, or null. */
export const getSession = cache(async () => {
  const store = await cookies();
  return unsealSession(store.get(SESSION_COOKIE)?.value);
});

/** The signed-in user for this request (one DB read per request), or null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.uid },
    include: { googleConnections: { where: { status: "active" }, select: { email: true }, orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!user || user.aiesecPersonId.toString() !== session.pid) return null;
  return {
    id: user.id,
    aiesecPersonId: user.aiesecPersonId.toString(),
    fullName: user.fullName,
    email: user.email,
    workEmail: user.aiesecEmail ?? user.googleConnections[0]?.email ?? null,
    photoUrl: user.photoUrl,
    officeName: user.officeName,
    positionTitle: user.positionTitle,
    isAdmin: isPlatformAdmin(user.aiesecPersonId),
  };
});

/** For pages: the user, or a redirect to sign in that comes back here. */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login");
  return user;
}

/** For admin pages: 404 for everyone else, so the page's existence is not advertised. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin/activity");
  if (!user.isAdmin) notFound();
  return user;
}
