import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

// Fixed-window counters in Postgres (one upsert per check). Keys never contain
// raw IPs; callers pass hashIp() output.

export type RateLimitResult = { allowed: boolean; remaining: number };

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  try {
    const rows = await db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::double precision) THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}::double precision) THEN now() ELSE rate_limits.window_start END
      RETURNING count`;
    const count = Number(rows[0]?.count ?? 0);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  } catch (error) {
    // Availability over strictness: a database hiccup must not block real respondents.
    logger.warn("rate_limit.unavailable", { key: key.split(":")[0], error });
    return { allowed: true, remaining: limit };
  }
}

/** Deletes windows that ended long ago (daily cron). */
export async function pruneRateLimits(olderThanSeconds = 24 * 60 * 60): Promise<number> {
  const result = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanSeconds * 1000) } } });
  return result.count;
}
