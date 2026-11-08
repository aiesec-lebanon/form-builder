import "server-only";

import type { Destination, GoogleConnection } from "@prisma/client";

import { decryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

import type { DeliveryResult, DestinationRole, DestinationSummary, DestinationType, LoadedDestination } from "./types";

function toLoaded(row: Destination): LoadedDestination {
  let secrets: Record<string, unknown> | null = null;
  if (row.secretsEnc) {
    try {
      secrets = decryptJson(row.secretsEnc) as Record<string, unknown>;
    } catch (error) {
      logger.error("destination.secrets_unreadable", { destinationId: row.id, error });
    }
  }
  return {
    id: row.id,
    formId: row.formId,
    type: row.type as DestinationType,
    role: row.role as DestinationRole,
    name: row.name,
    config: (row.config ?? {}) as Record<string, unknown>,
    secrets,
    googleConnectionId: row.googleConnectionId,
  };
}

export async function loadDestinations(formId: string, roles?: DestinationRole[]): Promise<LoadedDestination[]> {
  const rows = await db.destination.findMany({
    where: { formId, enabled: true, ...(roles ? { role: { in: roles } } : {}) },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toLoaded);
}

export async function loadDestination(formId: string, destinationId: string): Promise<LoadedDestination | null> {
  const row = await db.destination.findFirst({ where: { id: destinationId, formId } });
  return row ? toLoaded(row) : null;
}

/** Delivery health for owners; never throws. */
export async function recordHealth(destinationId: string, result: DeliveryResult): Promise<void> {
  try {
    await db.destination.update({
      where: { id: destinationId },
      data: result.ok
        ? { lastSuccessAt: new Date(), consecutiveFailures: 0, lastError: null }
        : { lastFailureAt: new Date(), lastError: result.message.slice(0, 300), consecutiveFailures: { increment: 1 } },
    });
  } catch (error) {
    logger.warn("destination.health_write_failed", { destinationId, error });
  }
}

function detailFor(row: Destination): { detail: string; link: string | null } {
  const config = (row.config ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  switch (row.type as DestinationType) {
    case "webhook": {
      try {
        const url = new URL(text(config.url));
        return { detail: `${url.host}${url.pathname === "/" ? "" : url.pathname}`, link: null };
      } catch {
        return { detail: "Webhook", link: null };
      }
    }
    case "supabase": {
      const host = (() => {
        try {
          return new URL(text(config.projectUrl)).host;
        } catch {
          return "";
        }
      })();
      return { detail: `${text(config.schema) || "public"}.${text(config.table)} on ${host}`, link: null };
    }
    case "postgres":
      return { detail: `${text(config.schema) || "public"}.${text(config.table)} on ${text(config.host)}`, link: null };
    case "google_sheets":
      return { detail: `Tab "${text(config.sheetTitle)}"`, link: text(config.spreadsheetUrl) || null };
    case "google_drive":
      return { detail: "Uploads folder in Google Drive", link: text(config.folderUrl) || null };
  }
}

export function summarize(row: Destination & { googleConnection: Pick<GoogleConnection, "email" | "status"> | null }): DestinationSummary {
  const { detail, link } = detailFor(row);
  const config = (row.config ?? {}) as Record<string, unknown>;
  const table =
    (row.type === "supabase" || row.type === "postgres") && typeof config.table === "string"
      ? { schema: typeof config.schema === "string" && config.schema ? config.schema : "public", name: config.table }
      : null;
  const health = row.consecutiveFailures > 0 || row.googleConnection?.status === "revoked" ? "failing" : row.lastSuccessAt ? "working" : "untested";
  return {
    id: row.id,
    type: row.type as DestinationType,
    role: row.role as DestinationRole,
    name: row.name,
    detail,
    link,
    table,
    connectedVia: row.googleConnection?.email ?? null,
    health,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
    lastError: row.googleConnection?.status === "revoked" ? "Google access was removed. Reconnect Google to keep sending." : row.lastError,
  };
}

export async function listSummaries(formId: string): Promise<DestinationSummary[]> {
  const rows = await db.destination.findMany({
    where: { formId },
    orderBy: [{ createdAt: "asc" }],
    include: { googleConnection: { select: { email: true, status: true } } },
  });
  return rows.map(summarize);
}
