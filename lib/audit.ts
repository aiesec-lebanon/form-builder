import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { hashIp } from "@/lib/crypto";
import { logger } from "@/lib/logger";

// Activity log (ADR-008). Metadata is small, typed and never contains answers,
// payloads or secrets. Recording never fails the caller's action.

export type AuditType =
  | "auth.sign_in"
  | "auth.sign_in_refused"
  | "auth.sign_out"
  | "form.created"
  | "form.published"
  | "form.closed"
  | "form.reopened"
  | "form.embed_sites_changed"
  | "form.trashed"
  | "form.restored"
  | "form.ownership_transferred"
  | "form.reported"
  | "form.report_reviewed"
  | "collaborator.added"
  | "collaborator.removed"
  | "destination.added"
  | "destination.removed"
  | "google.connected"
  | "google.disconnected"
  | "google.folder_moved";

export type AuditInput = {
  type: AuditType;
  actorId?: string | null;
  target?: { type: "user" | "form" | "destination" | "google_connection"; id: string };
  metadata?: Record<string, string | number | boolean | null>;
  ip?: string | null;
  userAgent?: string | null;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        type: input.type,
        actorId: input.actorId ?? null,
        targetType: input.target?.type ?? null,
        targetId: input.target?.id ?? null,
        metadata: input.metadata ?? Prisma.JsonNull,
        ipHash: hashIp(input.ip),
        userAgent: input.userAgent?.slice(0, 300) ?? null,
      },
    });
  } catch (error) {
    logger.error("audit.write_failed", { type: input.type, error });
  }
  logger.info(input.type, { actorId: input.actorId ?? null, targetType: input.target?.type, targetId: input.target?.id });
}
