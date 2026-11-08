import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { safeReturnTo } from "@/lib/auth/oauth";
import { newSessionPayload, nowSeconds, sealSession, SESSION_COOKIE, SESSION_ROLLING_SECONDS, sessionCookieOptions } from "@/lib/auth/session";
import { acceptPendingInvites, upsertUser } from "@/lib/auth/sign-in";
import { baseUrl, devLoginEnabled } from "@/lib/env";
import { clientIp, userAgent } from "@/lib/request";

export const dynamic = "force-dynamic";

// Local development only: signs in as a fake member without AIESEC, so the app
// can be exercised offline. 404 unless NODE_ENV=development and DEV_LOGIN=1;
// a production build can never enable it.

const DEV_PEOPLE = {
  "1": { fullName: "Dev Member", email: "dev.member@example.test", aiesecEmail: null, officeName: "AIESEC in Lebanon", positionTitle: "LCVP Marketing" },
  "2": { fullName: "Second Member", email: "second.member@example.test", aiesecEmail: null, officeName: "AIESEC in Beirut", positionTitle: "Team Leader" },
} as const;

export async function GET(request: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });

  const as = request.nextUrl.searchParams.get("as") === "2" ? "2" : "1";
  const person = DEV_PEOPLE[as];
  const personId = `900000000${as}`;
  const user = await upsertUser(personId, { ...person, photoUrl: null, officeId: null });
  await acceptPendingInvites(user);
  await recordAudit({
    type: "auth.sign_in",
    actorId: user.id,
    target: { type: "user", id: user.id },
    metadata: { dev: true },
    ip: clientIp(request.headers),
    userAgent: userAgent(request.headers),
  });

  const now = nowSeconds();
  const payload = newSessionPayload({
    userId: user.id,
    personId,
    tokens: { accessToken: "dev-session", refreshToken: null, expiresAt: now + SESSION_ROLLING_SECONDS },
    now,
  });
  const response = NextResponse.redirect(new URL(safeReturnTo(request.nextUrl.searchParams.get("returnTo")), baseUrl()));
  response.cookies.set(SESSION_COOKIE, await sealSession(payload), sessionCookieOptions(payload, now));
  return response;
}
