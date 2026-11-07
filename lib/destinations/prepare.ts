import "server-only";

import type { FormDocument } from "@/lib/forms/schema";
import { logger } from "@/lib/logger";

import { loadDestinations } from "./store";
import { adapterFor } from "./registry";

/**
 * Runs each destination's `prepare` for a document about to be published
 * (e.g. Google Sheets adds columns for new questions). Returns readable
 * warnings; never throws, because delivery repeats the same preparation.
 */
export async function prepareDestinations(formId: string, doc: FormDocument): Promise<string[]> {
  const warnings: string[] = [];
  const destinations = await loadDestinations(formId);
  for (const destination of destinations) {
    const adapter = adapterFor(destination.type);
    if (!adapter.prepare) continue;
    try {
      const result = await adapter.prepare(destination, doc);
      if (!result.ok) warnings.push(`${destination.name}: ${result.message}`);
    } catch (error) {
      logger.warn("destination.prepare_failed", { formId, destinationId: destination.id, error });
      warnings.push(`${destination.name}: couldn't be updated for this version.`);
    }
  }
  return warnings;
}
