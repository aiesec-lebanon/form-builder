import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** Liveness + database reachability for uptime checks. Reveals nothing else. */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logger.error("health.db_unreachable", { error });
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
