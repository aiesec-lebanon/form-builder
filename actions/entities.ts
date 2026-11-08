"use server";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser, getSession } from "@/lib/auth/current-user";
import { fetchEntities, GisError, type EntityScope } from "@/lib/auth/gis";
import { logger } from "@/lib/logger";

/**
 * AIESEC entities to fill a dropdown with, read with the signed-in member's
 * own AIESEC token (ADR-015). The list is then stored in the form like any options.
 */
export async function importAiesecEntities(scope: EntityScope): Promise<ActionResult<{ names: string[] }>> {
  const user = await getCurrentUser();
  const session = await getSession();
  if (!user || !session) return fail("Your session ended. Sign in again to continue.");
  if (scope !== "country" && scope !== "countries") return fail("Choose which entities to import.");
  try {
    const entities = await fetchEntities(session.at, scope);
    return ok({ names: entities.map((entity) => entity.name) });
  } catch (error) {
    logger.warn("entities.import_failed", { scope, error });
    if (error instanceof GisError && error.kind === "rejected") return fail("AIESEC didn't accept your sign-in. Reload the page and try again.");
    return fail("AIESEC didn't return the list just now. Try again, or type the options yourself.");
  }
}
