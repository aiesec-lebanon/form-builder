import { z } from "zod";

import type { AnswerValue } from "@/lib/forms/fields";
import type { ResponsePayload } from "@/lib/forms/payload";
import type { FormDocument } from "@/lib/forms/schema";

// Destination contracts (ADR-003). Isomorphic types + zod schemas for the
// non-secret `config` and the encrypted `secrets` of each destination type.

export const DESTINATION_TYPES = ["google_sheets", "google_drive", "webhook", "supabase", "postgres"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];
export type DestinationRole = "primary" | "secondary" | "files";

/** SQL identifiers we interpolate (always quoted too). */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const identifier = z.string().regex(IDENTIFIER, "Use letters, numbers and underscores, starting with a letter.");

export const webhookConfig = z.object({ url: z.string().url() });
export const webhookSecrets = z.object({ signingSecret: z.string().min(16) });

export const supabaseConfig = z.object({ projectUrl: z.string().url(), schema: identifier.default("public"), table: identifier });
export const supabaseSecrets = z.object({ apiKey: z.string().min(20) });

export const postgresConfig = z.object({ host: z.string(), database: z.string(), schema: identifier.default("public"), table: identifier });
export const postgresSecrets = z.object({ connectionString: z.string().min(10) });

export const sheetColumn = z.object({ fieldId: z.string(), header: z.string() });
export const sheetsConfig = z.object({
  spreadsheetId: z.string().min(10),
  spreadsheetUrl: z.string().url(),
  sheetId: z.number().int(),
  sheetTitle: z.string().min(1),
  columns: z.array(sheetColumn).default([]),
  /** The form's folder in AIESEC Forms (absent for Sheets made before folders). */
  formFolderId: z.string().optional(),
});
export type SheetsConfig = z.infer<typeof sheetsConfig>;

/** folderId: the form's folder (or, for older connections, its uploads folder). Uploads go into one subfolder per file question. */
export const driveConfig = z.object({
  folderId: z.string().min(10),
  folderUrl: z.string().url(),
  formFolderId: z.string().optional(),
  questionFolders: z.record(z.string(), z.string()).default({}),
});
export type DriveConfig = z.infer<typeof driveConfig>;

/** A destination row with its secrets decrypted. Server-only in practice. */
export type LoadedDestination = {
  id: string;
  formId: string;
  type: DestinationType;
  role: DestinationRole;
  name: string;
  config: Record<string, unknown>;
  secrets: Record<string, unknown> | null;
  googleConnectionId: string | null;
};

/** `message` is safe to store and show: it never contains response data or secrets. */
export type DeliveryResult = { ok: true } | { ok: false; retryable: boolean; message: string };

export type DeliveryContext = {
  payload: ResponsePayload;
  doc: FormDocument;
  values: Record<string, AnswerValue | null>;
};

export interface DestinationAdapter {
  type: DestinationType;
  /** Absent for file storage (Drive receives files directly from browsers). */
  deliver?: (destination: LoadedDestination, context: DeliveryContext) => Promise<DeliveryResult>;
  test: (destination: LoadedDestination) => Promise<DeliveryResult>;
  /** Runs on publish, e.g. syncing Sheet columns. */
  prepare?: (destination: LoadedDestination, doc: FormDocument) => Promise<DeliveryResult>;
}

/** What the builder may see: no secrets, ever. */
export type DestinationSummary = {
  id: string;
  type: DestinationType;
  role: DestinationRole;
  name: string;
  detail: string;
  link: string | null;
  /** Schema and table for database destinations (for the per-question view SQL). */
  table: { schema: string; name: string } | null;
  connectedVia: string | null;
  health: "working" | "failing" | "untested";
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export const failure = (message: string, retryable = true): DeliveryResult => ({ ok: false, retryable, message });
export const success: DeliveryResult = { ok: true };
