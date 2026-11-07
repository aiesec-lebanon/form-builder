import "server-only";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Aggregate view counter for completion rates. Runs after the response is sent; never fails a page. */
export async function countView(formId: string): Promise<void> {
  try {
    await db.form.update({ where: { id: formId }, data: { viewCount: { increment: 1 } } });
  } catch (error) {
    logger.warn("form.view_count_failed", { formId, error });
  }
}

/** "31%" of views that ended in a response, or null when there's too little data. */
export function completionRate(responses: number, views: number): number | null {
  if (views < 5) return null;
  return Math.min(100, Math.round((responses / views) * 100));
}
