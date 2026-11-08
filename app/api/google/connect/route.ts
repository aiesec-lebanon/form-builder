import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { safeReturnTo } from "@/lib/auth/oauth";
import { randomToken } from "@/lib/crypto";
import { baseUrl, googleAllowedDomains, googleConfigured } from "@/lib/env";
import { GOOGLE_RETURN_COOKIE, GOOGLE_STATE_COOKIE, googleAuthorizeUrl, googleCookieOptions } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/** Starts "Connect Google" for the signed-in member. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo") ?? "/settings");
  if (!user) return NextResponse.redirect(new URL(`/login?returnTo=${encodeURIComponent(returnTo)}`, baseUrl()));
  if (!googleConfigured()) return NextResponse.redirect(new URL(`${returnTo}${returnTo.includes("?") ? "&" : "?"}google_error=not_configured`, baseUrl()));

  // Files are created in the connected account's Drive, so steer people to their AIESEC
  // (Workspace) account. Their EXPA email is often a personal address: only hint it when allowed.
  const domains = googleAllowedDomains();
  const hostedDomain = domains ? (domains.length === 1 ? domains[0] : "*") : null;
  const loginHint = user.email && domains?.some((domain) => user.email?.endsWith(`@${domain}`)) ? user.email : null;
  const state = randomToken(32);
  const response = NextResponse.redirect(googleAuthorizeUrl(state, { loginHint, hostedDomain }));
  response.cookies.set(GOOGLE_STATE_COOKIE, state, googleCookieOptions());
  response.cookies.set(GOOGLE_RETURN_COOKIE, returnTo, googleCookieOptions());
  response.headers.set("Cache-Control", "no-store");
  return response;
}
