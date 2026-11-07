import "server-only";

import { logger } from "@/lib/logger";

import { classifyError } from "./errors";
import { adapterFor } from "./registry";
import { loadDestinations, recordHealth } from "./store";
import { failure, type DeliveryContext, type DeliveryResult, type LoadedDestination } from "./types";

// Delivery orchestration (ADR-003): the primary must accept the response;
// secondaries run afterwards and only record health. Nothing is persisted.

async function safeDeliver(destination: LoadedDestination, context: DeliveryContext): Promise<DeliveryResult> {
  const adapter = adapterFor(destination.type);
  if (!adapter.deliver) return failure("This destination can't receive responses.", false);
  try {
    return await adapter.deliver(destination, context);
  } catch (error) {
    logger.warn("destination.deliver_threw", { destinationId: destination.id, type: destination.type, error });
    return classifyError(error);
  }
}

export type PrimaryOutcome = { ok: true; secondaries: LoadedDestination[] } | { ok: false; retryable: boolean; message: string };

export async function deliverToPrimary(formId: string, context: DeliveryContext): Promise<PrimaryOutcome> {
  const destinations = await loadDestinations(formId, ["primary", "secondary"]);
  const primary = destinations.find((destination) => destination.role === "primary");
  if (!primary) return { ok: false, retryable: false, message: "This form isn't connected to a destination." };

  const started = Date.now();
  const result = await safeDeliver(primary, context);
  await recordHealth(primary.id, result);
  logger.info("delivery.primary", { formId, destinationId: primary.id, type: primary.type, ok: result.ok, ms: Date.now() - started });
  if (!result.ok) return result;
  return { ok: true, secondaries: destinations.filter((destination) => destination.role === "secondary") };
}

export async function deliverToSecondaries(destinations: LoadedDestination[], context: DeliveryContext): Promise<void> {
  await Promise.allSettled(
    destinations.map(async (destination) => {
      const result = await safeDeliver(destination, context);
      await recordHealth(destination.id, result);
      logger.info("delivery.secondary", { formId: destination.formId, destinationId: destination.id, type: destination.type, ok: result.ok });
    }),
  );
}

export async function testDestination(destination: LoadedDestination): Promise<DeliveryResult> {
  try {
    return await adapterFor(destination.type).test(destination);
  } catch (error) {
    logger.warn("destination.test_threw", { destinationId: destination.id, type: destination.type, error });
    return classifyError(error);
  }
}
