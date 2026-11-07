import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { SESSION_COOKIE, unsealSession } from "@/lib/auth/session";
import { baseUrl } from "@/lib/env";
import { isSameOrigin } from "@/lib/http";
import { clientIp, userAgent } from "@/lib/request";

export const dynamic = "force-dynamic";

/** Signs out of AIESEC Forms only: deletes our cookie. The AIESEC token is left alone by design. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request, new URL(baseUrl()).origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) {
    await recordAudit({
      type: "auth.sign_out",
      actorId: session.uid,
      target: { type: "user", id: session.uid },
      ip: clientIp(request.headers),
      userAgent: userAgent(request.headers),
    });
  }

  // 303 so the browser follows with GET.
  const response = NextResponse.redirect(new URL("/login?signedOut=1", baseUrl()), 303);
  response.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
