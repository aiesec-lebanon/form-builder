"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { classifyError } from "@/lib/destinations/errors";
import { googlePickerConfig } from "@/lib/env";
import { placeRootFolder } from "@/lib/google/folders";
import { googleAccessToken } from "@/lib/google/tokens";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const SIGNED_OUT = "Your session ended. Sign in again to continue.";
const DRIVE_ID = /^[A-Za-z0-9_-]{10,200}$/;

async function ownConnection(userId: string, connectionId: string) {
  return db.googleConnection.findFirst({ where: { id: connectionId, userId, status: "active" }, select: { id: true } });
}

const googleProblem = (error: unknown, fallback: string) => {
  const result = classifyError(error);
  return result.ok ? fallback : result.message;
};

/**
 * What the owner's browser needs to open Google Picker on one of their own
 * accounts (ADR-016): a short-lived access token (drive.file only), the
 * browser API key and the project number. Picked files become accessible to us.
 */
export async function googlePickerSession(connectionId: string): Promise<ActionResult<{ token: string; apiKey: string; appId: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const picker = googlePickerConfig();
  if (!picker) return fail("Choosing from Drive isn't set up on this server yet.");
  const connection = await ownConnection(user.id, connectionId);
  if (!connection) return fail("Connect your Google account first.");
  if (!(await rateLimit(`picker:${user.id}`, 30, 60)).allowed) return fail("Too many tries. Wait a minute and try again.");
  try {
    return ok({ token: await googleAccessToken(connection.id), ...picker });
  } catch (error) {
    logger.warn("google.picker_session_failed", { connectionId, error });
    return fail(googleProblem(error, "Couldn't reach Google. Try again."));
  }
}

/** Moves (or makes) the account's AIESEC Forms folder inside a folder the owner picked. */
export async function setGoogleFolderLocation(connectionId: string, folderId: string): Promise<ActionResult<{ rootFolderId: string; parentName: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  if (!DRIVE_ID.test(folderId)) return fail("Choose the folder again.");
  const connection = await ownConnection(user.id, connectionId);
  if (!connection) return fail("Connect your Google account first.");
  try {
    const token = await googleAccessToken(connection.id);
    const placed = await placeRootFolder(token, connection.id, folderId);
    if (!placed.ok) return fail(placed.message);
    await recordAudit({ type: "google.folder_moved", actorId: user.id, target: { type: "google_connection", id: connection.id } });
    return ok({ rootFolderId: placed.rootId, parentName: placed.parentName });
  } catch (error) {
    logger.warn("google.folder_move_failed", { connectionId, error });
    return fail(googleProblem(error, "Couldn't move the folder. Try again."));
  }
}

/** Disconnects a Google account: revokes our grant at Google and forgets the tokens. */
export async function disconnectGoogle(connectionId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
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
