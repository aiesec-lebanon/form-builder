import { NextResponse, type NextRequest } from "next/server";

import { OAuthError, refreshTokens } from "@/lib/auth/oauth";
import { needsRefresh, nowSeconds, sealSession, SESSION_COOKIE, sessionCookieOptions, unsealSession, withRefreshedTokens } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

// First gate for every request (ADR-002): session check for app routes, inline
// AIESEC token refresh on top-level navigations, and security headers.
// Pages and actions still authorize on their own; this only keeps the
// signed-out out early.

const PUBLIC_PREFIXES = ["/login", "/unauthorized", "/privacy", "/f/", "/embed/", "/api/auth/", "/api/health", "/api/f/", "/api/cron/"];

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => (prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

function isEmbed(pathname: string): boolean {
  return pathname.startsWith("/embed/");
}

function isApi(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/** A full page load (not an RSC fetch, prefetch or Server Action). Only these refresh tokens. */
function isDocumentNavigation(request: NextRequest): boolean {
  if (request.method !== "GET") return false;
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch") || request.headers.has("next-action")) return false;
  const destination = request.headers.get("sec-fetch-dest");
  if (destination) return destination === "document";
  return (request.headers.get("accept") ?? "").includes("text/html");
}

function contentSecurityPolicy(nonce: string, embed: boolean, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    // Browser-to-Drive resumable uploads (ADR-004).
    "connect-src 'self' https://www.googleapis.com",
    "media-src 'self'",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    embed ? "frame-ancestors *" : "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse, csp: string, embed: boolean): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()");
  if (!embed) {
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  }
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
}

function signInRedirect(request: NextRequest, error?: string): NextResponse {
  const url = new URL("/login", request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/") url.searchParams.set("returnTo", `${pathname}${search}`);
  if (error) url.searchParams.set("error", error);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDev = process.env.NODE_ENV === "development";
  const embed = isEmbed(pathname);
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = contentSecurityPolicy(nonce, embed, isDev);

  const forward = (extraCookie?: string) => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    // Next reads the nonce from the request CSP and applies it to its own scripts.
    headers.set("Content-Security-Policy", csp);
    if (extraCookie !== undefined) {
      const others = (request.headers.get("cookie") ?? "")
        .split(/;\s*/)
        .filter((pair) => pair && !pair.startsWith(`${SESSION_COOKIE}=`));
      headers.set("cookie", [...others, `${SESSION_COOKIE}=${extraCookie}`].join("; "));
    }
    return NextResponse.next({ request: { headers } });
  };

  if (isPublic(pathname)) return withSecurityHeaders(forward(), csp, embed);

  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    const response = isApi(pathname)
      ? NextResponse.json({ ok: false, error: "unauthorized", message: "Sign in to continue." }, { status: 401 })
      : signInRedirect(request);
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return withSecurityHeaders(response, csp, embed);
  }

  if (needsRefresh(session) && session.rt && isDocumentNavigation(request)) {
    try {
      const tokens = await refreshTokens(session.rt);
      const now = nowSeconds();
      const renewed = withRefreshedTokens(session, tokens, now);
      const sealed = await sealSession(renewed);
      const response = forward(sealed);
      response.cookies.set(SESSION_COOKIE, sealed, sessionCookieOptions(renewed, now));
      return withSecurityHeaders(response, csp, embed);
    } catch (error) {
      if (error instanceof OAuthError && error.kind === "invalid") {
        logger.info("auth.refresh_rejected", { userId: session.uid });
        const response = signInRedirect(request, "session_expired");
        response.cookies.delete(SESSION_COOKIE);
        return withSecurityHeaders(response, csp, embed);
      }
      // AIESEC unreachable: our session is still valid; try again next navigation.
      logger.warn("auth.refresh_unavailable", { userId: session.uid, error });
    }
  }

  return withSecurityHeaders(forward(), csp, embed);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/|embed.js|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|woff2?|txt|xml|webmanifest)$).*)",
  ],
};
