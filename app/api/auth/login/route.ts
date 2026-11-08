import { NextResponse, type NextRequest } from "next/server";

import { authorizeUrl, handshakeCookieOptions, RETURN_TO_COOKIE, safeReturnTo, STATE_COOKIE } from "@/lib/auth/oauth";
import { isFormPath, PURPOSE_COOKIE } from "@/lib/auth/respondent";
import { randomToken } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Starts the AIESEC sign-in: a single-use `state` bound to this browser, then off to auth.aiesec.org.
 * `purpose=respond` signs someone in to answer an AIESEC-only form (ADR-013): no app account, back to the form.
 */
export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const respond = request.nextUrl.searchParams.get("purpose") === "respond" && isFormPath(returnTo);
  const state = randomToken(32);

  const response = NextResponse.redirect(authorizeUrl(state));
  // Set on the very response that redirects, so the browser stores them before leaving.
  response.cookies.set(STATE_COOKIE, state, handshakeCookieOptions());
  response.cookies.set(RETURN_TO_COOKIE, returnTo, handshakeCookieOptions());
  response.cookies.set(PURPOSE_COOKIE, respond ? "respond" : "", handshakeCookieOptions(respond ? undefined : 0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
