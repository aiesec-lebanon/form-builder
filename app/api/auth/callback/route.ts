import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { activePositions, fetchCurrentPerson, GisError } from "@/lib/auth/gis";
import { exchangeCode, handshakeCookieOptions, OAuthError, RETURN_TO_COOKIE, safeReturnTo, STATE_COOKIE } from "@/lib/auth/oauth";
import { evaluateAccess } from "@/lib/auth/policy";
import { newSessionPayload, nowSeconds, sealSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { acceptPendingInvites, profileFromPerson, upsertUser } from "@/lib/auth/sign-in";
import { safeEqual } from "@/lib/crypto";
import { baseUrl, env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { clientIp, userAgent } from "@/lib/request";

export const dynamic = "force-dynamic";

type FailureCode = "denied" | "state" | "missing_code" | "exchange_failed" | "aiesec_unavailable" | "server_error";

function clearHandshake(response: NextResponse): NextResponse {
  response.cookies.set(STATE_COOKIE, "", handshakeCookieOptions(0));
  response.cookies.set(RETURN_TO_COOKIE, "", handshakeCookieOptions(0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function failure(code: FailureCode): NextResponse {
  return clearHandshake(NextResponse.redirect(new URL(`/login?error=${code}`, baseUrl())));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const ip = clientIp(request.headers);
  const ua = userAgent(request.headers);

  if (params.get("error")) {
    logger.info("auth.provider_error", { providerError: params.get("error")?.slice(0, 100) });
    return failure("denied");
  }

  // `state` first, always, before the single-use code is spent on anything.
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const returnedState = params.get("state");
  if (!expectedState || !returnedState || !safeEqual(expectedState, returnedState)) {
    logger.warn("auth.state_mismatch", { hadCookie: Boolean(expectedState), hadParam: Boolean(returnedState) });
    return failure("state");
  }
  const returnTo = safeReturnTo(request.cookies.get(RETURN_TO_COOKIE)?.value);

  const code = params.get("code");
  if (!code) return failure("missing_code");

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch (error) {
    logger.warn("auth.exchange_failed", { error });
    return failure(error instanceof OAuthError && error.kind === "unavailable" ? "aiesec_unavailable" : "exchange_failed");
  }

  let person;
  try {
    person = await fetchCurrentPerson(tokens.accessToken);
  } catch (error) {
    logger.warn("auth.identity_failed", { error });
    return failure(error instanceof GisError && error.kind === "rejected" ? "exchange_failed" : "aiesec_unavailable");
  }

  const config = env();
  const decision = evaluateAccess(
    { personId: person.id, activePositionCount: activePositions(person).length },
    { requireCurrentPosition: config.REQUIRE_CURRENT_POSITION, adminIds: config.PLATFORM_ADMIN_PERSON_IDS },
  );
  if (!decision.allowed) {
    await recordAudit({ type: "auth.sign_in_refused", metadata: { reason: decision.reason, aiesecPersonId: person.id }, ip, userAgent: ua });
    return clearHandshake(NextResponse.redirect(new URL(`/unauthorized?reason=${decision.reason}`, baseUrl())));
  }

  try {
    const profile = profileFromPerson(person);
    const user = await upsertUser(person.id, profile);
    const invitesAccepted = await acceptPendingInvites(user);
    await recordAudit({
      type: "auth.sign_in",
      actorId: user.id,
      target: { type: "user", id: user.id },
      metadata: { office: profile.officeName, position: profile.positionTitle, invitesAccepted },
      ip,
      userAgent: ua,
    });

    const now = nowSeconds();
    const payload = newSessionPayload({ userId: user.id, personId: person.id, tokens, now });
    const response = NextResponse.redirect(new URL(returnTo, baseUrl()));
    response.cookies.set(SESSION_COOKIE, await sealSession(payload), sessionCookieOptions(payload, now));
    return clearHandshake(response);
  } catch (error) {
    logger.error("auth.sign_in_failed", { error });
    return failure("server_error");
  }
}
