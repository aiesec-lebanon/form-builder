import type { NextRequest } from "next/server";

import { hashIp } from "@/lib/crypto";
import { db } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

export const dynamic = "force-dynamic";

/**
 * "Contact form owner": the owner's name and email, fetched only when someone
 * asks, so the address isn't in every page (and harder to scrape).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ipKey = hashIp(clientIp(request.headers)) ?? "unknown";
  if (!(await rateLimit(`contact:${ipKey}`, 30, 3600)).allowed) return jsonError(429, "rate_limited", "Too many requests. Try again later.");
  const form = await db.form.findUnique({ where: { slug }, select: { published: true, deletedAt: true, owner: { select: { fullName: true, email: true } } } });
  if (!form || form.deletedAt || !form.published) return jsonError(404, "not_found", "This form doesn't exist anymore.");
  const response = jsonOk({ name: form.owner.fullName, email: form.owner.email ?? null });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
