"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Disconnects a Google account: revokes our grant at Google and forgets the tokens. */
export async function disconnectGoogle(connectionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("Your session ended. Sign in again to continue.");
  const connection = await db.googleConnection.findFirst({ where: { id: connectionId, userId: user.id } });
  if (!connection) return ok();

  try {
    const token = decryptSecret(connection.refreshTokenEnc);
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    // Revocation is best effort; the stored tokens are deleted either way.
    logger.warn("google.revoke_failed", { connectionId, error });
  }

  await db.googleConnection.delete({ where: { id: connection.id } });
  await recordAudit({ type: "google.disconnected", actorId: user.id, target: { type: "google_connection", id: connection.id } });
  revalidatePath("/settings");
  return ok();
}
