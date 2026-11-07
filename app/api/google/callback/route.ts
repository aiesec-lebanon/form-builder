import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeReturnTo } from "@/lib/auth/oauth";
import { encryptSecret, safeEqual } from "@/lib/crypto";
import { db } from "@/lib/db";
import { baseUrl } from "@/lib/env";
import { exchangeGoogleCode, GOOGLE_RETURN_COOKIE, GOOGLE_STATE_COOKIE, googleCookieOptions, GoogleAuthError } from "@/lib/google/oauth";
import { logger } from "@/lib/logger";
import { clientIp, userAgent } from "@/lib/request";

export const dynamic = "force-dynamic";

function back(returnTo: string, param: string): NextResponse {
  const url = new URL(returnTo, baseUrl());
  const [key, value] = param.split("=");
  url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_STATE_COOKIE, "", googleCookieOptions(0));
  response.cookies.set(GOOGLE_RETURN_COOKIE, "", googleCookieOptions(0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.cookies.get(GOOGLE_RETURN_COOKIE)?.value ?? "/settings");
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, baseUrl()));

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back(returnTo, "google_error=denied");

  const expected = request.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const state = params.get("state");
  if (!expected || !state || !safeEqual(expected, state)) {
    logger.warn("google.state_mismatch", { userId: user.id });
    return back(returnTo, "google_error=expired");
  }
  const code = params.get("code");
  if (!code) return back(returnTo, "google_error=failed");

  try {
    const grant = await exchangeGoogleCode(code);
    const data = {
      email: grant.email,
      refreshTokenEnc: encryptSecret(grant.refreshToken),
      accessTokenEnc: encryptSecret(grant.accessToken),
      accessTokenExpiresAt: grant.expiresAt,
      scopes: grant.scopes,
      status: "active",
    };
    const connection = await db.googleConnection.upsert({
      where: { userId_googleSub: { userId: user.id, googleSub: grant.sub } },
      create: { userId: user.id, googleSub: grant.sub, ...data },
      update: data,
    });
    await recordAudit({
      type: "google.connected",
      actorId: user.id,
      target: { type: "google_connection", id: connection.id },
      ip: clientIp(request.headers),
      userAgent: userAgent(request.headers),
    });
    return back(returnTo, "google=connected");
  } catch (error) {
    logger.warn("google.connect_failed", { userId: user.id, error });
    const reason = error instanceof GoogleAuthError && error.message.includes("Drive access") ? "drive_scope" : "failed";
    return back(returnTo, `google_error=${reason}`);
  }
}
