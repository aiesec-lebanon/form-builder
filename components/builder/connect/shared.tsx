import { Database, FileSpreadsheet, FolderOpen, Webhook, type LucideIcon } from "lucide-react";

import type { DestinationType } from "@/lib/destinations/types";

export const DESTINATION_META: Record<DestinationType, { name: string; icon: LucideIcon; blurb: string }> = {
  google_sheets: { name: "Google Sheets", icon: FileSpreadsheet, blurb: "Each response becomes a row in a Google Sheet: a new one we create, or one you already have." },
  webhook: { name: "Webhook", icon: Webhook, blurb: "Signed JSON to any URL: Zapier, Make, n8n, Apps Script or your server." },
  supabase: { name: "Supabase", icon: Database, blurb: "Each response becomes a row in a table in your own Supabase project." },
  postgres: { name: "PostgreSQL", icon: Database, blurb: "Each response becomes a row in your own PostgreSQL database (Neon, RDS and others)." },
  google_drive: { name: "Google Drive", icon: FolderOpen, blurb: "Uploaded files go to your form's folder in Google Drive." },
};

export type GoogleAccount = { id: string; email: string; /** The account's AIESEC Forms folder, once made. */ rootFolderId: string | null };

export const WEBHOOK_VERIFY_SNIPPET = `// Node.js: verify a request from AIESEC Forms
const crypto = require("crypto");

function isFromAiesecForms(rawBody, headers, secret) {
  const timestamp = headers["x-aiesec-forms-timestamp"];
  const expected = "v1=" + crypto
    .createHmac("sha256", secret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  const given = String(headers["x-aiesec-forms-signature"] || "");
  return given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}`;
