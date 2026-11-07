import "server-only";

import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

import { GoogleAuthError, refreshGoogleToken } from "./oauth";

const EARLY_REFRESH_MS = 60_000;

/** A valid Google access token for a connection, refreshing (and caching, encrypted) as needed. */
export async function googleAccessToken(connectionId: string): Promise<string> {
  const connection = await db.googleConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new GoogleAuthError("revoked", "Google connection not found");
  if (connection.status !== "active") throw new GoogleAuthError("revoked", "Google connection was revoked");

  if (connection.accessTokenEnc && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() - EARLY_REFRESH_MS > Date.now()) {
    try {
      return decryptSecret(connection.accessTokenEnc);
    } catch {
      // Unreadable cache (key rotated): fall through and refresh.
    }
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refreshTokenEnc);
  } catch (error) {
    logger.error("google.refresh_token_unreadable", { connectionId, error });
    throw new GoogleAuthError("revoked", "Stored Google credentials are unreadable");
  }

  try {
    const fresh = await refreshGoogleToken(refreshToken);
    await db.googleConnection.update({
      where: { id: connectionId },
      data: { accessTokenEnc: encryptSecret(fresh.accessToken), accessTokenExpiresAt: fresh.expiresAt },
    });
    return fresh.accessToken;
  } catch (error) {
    if (error instanceof GoogleAuthError && error.kind === "revoked") {
      await db.googleConnection.update({ where: { id: connectionId }, data: { status: "revoked", accessTokenEnc: null, accessTokenExpiresAt: null } });
      logger.warn("google.connection_revoked", { connectionId });
    }
    throw error;
  }
}
