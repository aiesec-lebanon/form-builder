import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

import { frameAncestorsDirective } from "./embed-domains";

// The frame-ancestors directive for /embed/<slug>, read by the proxy on every
// embed page load (ADR-011). One indexed lookup by slug, cached per process so
// the proxy stays fast; owners' changes apply within the cache lifetime.

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;
/** Used when the lookup fails with nothing cached: only our own pages may frame it. */
export const FAIL_CLOSED = "frame-ancestors 'self'";

type Entry = { directive: string; expires: number };
const cache = new Map<string, Entry>();

function remember(slug: string, directive: string, now: number) {
  cache.delete(slug);
  cache.set(slug, { directive, expires: now + TTL_MS });
  // Oldest first: Map keeps insertion order, and refreshed entries move to the end.
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

export async function embedFrameAncestors(slug: string, now = Date.now()): Promise<string> {
  const cached = cache.get(slug);
  if (cached && cached.expires > now) return cached.directive;
  try {
    const form = await db.form.findUnique({ where: { slug }, select: { embedDomains: true, deletedAt: true } });
    // Unknown or trashed forms render a not-found page, which may be framed anywhere.
    const directive = frameAncestorsDirective(form && !form.deletedAt ? (form.embedDomains ?? []) : []);
    remember(slug, directive, now);
    return directive;
  } catch (error) {
    logger.warn("embed.policy_lookup_failed", { error });
    return cached?.directive ?? FAIL_CLOSED;
  }
}

/** Tests only. */
export function clearEmbedPolicyCache() {
  cache.clear();
}
