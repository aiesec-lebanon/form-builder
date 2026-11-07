import "server-only";

import { GoogleApiError } from "@/lib/google/api";
import { GoogleAuthError } from "@/lib/google/oauth";
import { BlockedHostError } from "@/lib/net/guard";

import { failure, type DeliveryResult } from "./types";

/** Turns anything thrown during delivery into a safe, readable result. */
export function classifyError(error: unknown): DeliveryResult {
  if (error instanceof BlockedHostError) return failure(error.message, false);
  if (error instanceof GoogleAuthError) {
    return error.kind === "revoked" ? failure("Google access was removed. Reconnect Google to keep sending.", false) : failure("Google sign-in is unavailable right now.");
  }
  if (error instanceof GoogleApiError) {
    if (error.status === 404) return failure("The Google file was deleted or moved to the trash.", false);
    if (error.status === 403) return failure("Google refused access to the file. It may belong to another account now.", false);
    if (error.retryable) return failure("Google is busy right now. Responses will retry.");
    return failure(`Google rejected the request (${error.message}).`, false);
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") return failure("The destination didn't respond within 10 seconds.");
  return failure("Couldn't reach the destination.");
}
