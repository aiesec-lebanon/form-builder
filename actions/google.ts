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
import { DRIVE_FILE_ID, driveLinkProblem, parseDriveLink, type DriveLocation, type WantedKind } from "@/lib/google/links";
import { checkLocation } from "@/lib/google/locations";
import { googleAccessToken } from "@/lib/google/tokens";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

const SIGNED_OUT = "Your session ended. Sign in again to continue.";

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

export type CheckedLocation = { status: "ready"; location: DriveLocation } | { status: "needs_access"; fileId: string };

/**
 * Checks a Drive folder or Sheet link the owner pasted (or the id of one they
 * chose in Google Picker), in My Drive or a shared drive. "needs_access": the
 * link is fine but AIESEC Forms can't open the file yet (drive.file), so the
 * browser shows that one file in Google's chooser to confirm, then checks again.
 */
export async function checkGoogleLocation(connectionId: string, input: { link: string; kind: WantedKind }): Promise<ActionResult<CheckedLocation>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  // Server actions take any input: don't trust the shape.
  const kind: WantedKind = input?.kind === "spreadsheet" ? "spreadsheet" : "folder";
  const link = parseDriveLink(typeof input?.link === "string" ? input.link.slice(0, 2000) : "");
  const linkProblem = driveLinkProblem(link, kind);
  if (!link || linkProblem) return fail(linkProblem ?? "Paste the link again.");
  const connection = await ownConnection(user.id, connectionId);
  if (!connection) return fail("Connect your Google account first.");
  if (!(await rateLimit(`google-location:${user.id}`, 30, 60)).allowed) return fail("Too many tries. Wait a minute and try again.");
  try {
    const token = await googleAccessToken(connection.id);
    const check = await checkLocation(token, link.id, kind);
    if (check.ok) return ok({ status: "ready", location: check.location });
    if (check.needsAccess) return ok({ status: "needs_access", fileId: link.id });
    return fail(check.message);
  } catch (error) {
    logger.warn("google.location_check_failed", { connectionId, error });
    return fail(googleProblem(error, "Couldn't reach Google. Try again."));
  }
}

/** Moves (or makes) the account's AIESEC Forms folder inside a folder the owner picked. */
export async function setGoogleFolderLocation(connectionId: string, folderId: string): Promise<ActionResult<{ rootFolderId: string; parentName: string; moved: boolean; sharedDrive: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  if (!DRIVE_FILE_ID.test(folderId)) return fail("Choose the folder again.");
  const connection = await ownConnection(user.id, connectionId);
  if (!connection) return fail("Connect your Google account first.");
  try {
    const token = await googleAccessToken(connection.id);
    const placed = await placeRootFolder(token, connection.id, folderId);
    if (!placed.ok) return fail(placed.message);
    await recordAudit({ type: "google.folder_moved", actorId: user.id, target: { type: "google_connection", id: connection.id } });
    return ok({ rootFolderId: placed.rootId, parentName: placed.parentName, moved: placed.moved, sharedDrive: placed.sharedDrive });
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
