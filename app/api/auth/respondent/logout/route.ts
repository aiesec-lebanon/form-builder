import { NextResponse, type NextRequest } from "next/server";

import { safeReturnTo } from "@/lib/auth/oauth";
import { isFormPath, respondentCookieOptions, RESPONDENT_COOKIE } from "@/lib/auth/respondent";
import { baseUrl } from "@/lib/env";
import { isSameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

/** "Not you?" on an AIESEC-only form: forgets the respondent and goes back to the form (ADR-013). */
export async function POST(request: NextRequest) {
  const candidate = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const returnTo = isFormPath(candidate) ? candidate : "/";
  if (!isSameOrigin(request, new URL(baseUrl()).origin)) return NextResponse.redirect(new URL(returnTo, baseUrl()), 303);
  const response = NextResponse.redirect(new URL(returnTo, baseUrl()), 303);
  response.cookies.set(RESPONDENT_COOKIE, "", respondentCookieOptions(0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
