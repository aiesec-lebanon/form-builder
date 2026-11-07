import "server-only";

import { randomUUID } from "node:crypto";

import { hmacSha256Hex, randomToken } from "@/lib/crypto";
import { guardedFetch } from "@/lib/net/guard";

import { failure, success, webhookConfig, webhookSecrets, type DeliveryResult, type DestinationAdapter } from "./types";

// Webhooks: signed JSON POST. Receivers verify:
//   expected = hex(HMAC-SHA256(secret, `${X-AIESEC-Forms-Timestamp}.${rawBody}`))
//   X-AIESEC-Forms-Signature === `v1=${expected}`
// and dedupe on Idempotency-Key (the response id).

export const USER_AGENT = "AIESEC-Forms-Webhook/1.0";

export function newSigningSecret(): string {
  return `whsec_${randomToken(24)}`;
}

export function signatureHeaders(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  return {
    "X-AIESEC-Forms-Timestamp": String(timestamp),
    "X-AIESEC-Forms-Signature": `v1=${hmacSha256Hex(secret, `${timestamp}.${body}`)}`,
  };
}

export function interpretStatus(status: number): DeliveryResult {
  if (status >= 200 && status < 300) return success;
  if (status >= 300 && status < 400) return failure("The webhook URL redirects. Use the final URL instead.", false);
  if (status === 408 || status === 429) return failure(`The webhook asked us to slow down (HTTP ${status}).`);
  if (status >= 500) return failure(`The webhook had an error (HTTP ${status}).`);
  return failure(`The webhook refused the request (HTTP ${status}).`, false);
}

async function post(url: string, secret: string, event: string, body: Record<string, unknown>, idempotencyKey: string): Promise<DeliveryResult> {
  const raw = JSON.stringify({ event, ...body });
  const response = await guardedFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-AIESEC-Forms-Event": event,
      "X-AIESEC-Forms-Delivery": randomUUID(),
      "Idempotency-Key": idempotencyKey,
      ...signatureHeaders(secret, raw),
    },
    body: raw,
  });
  return interpretStatus(response.status);
}

function parse(destination: { config: unknown; secrets: unknown }) {
  const config = webhookConfig.safeParse(destination.config);
  const secrets = webhookSecrets.safeParse(destination.secrets);
  return config.success && secrets.success ? { url: config.data.url, secret: secrets.data.signingSecret } : null;
}

export const webhookAdapter: DestinationAdapter = {
  type: "webhook",
  async deliver(destination, { payload }) {
    const parsed = parse(destination);
    if (!parsed) return failure("This webhook's settings are incomplete. Remove it and add it again.", false);
    return post(parsed.url, parsed.secret, "response.created", payload, payload.responseId);
  },
  async test(destination) {
    const parsed = parse(destination);
    if (!parsed) return failure("This webhook's settings are incomplete. Remove it and add it again.", false);
    const id = randomUUID();
    return post(parsed.url, parsed.secret, "test", { testId: id, formId: destination.formId, sentAt: new Date().toISOString() }, id);
  },
};
