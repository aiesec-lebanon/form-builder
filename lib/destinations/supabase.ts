import "server-only";

import { buildRowData } from "@/lib/forms/payload";
import { guardedFetch } from "@/lib/net/guard";

import { failure, success, supabaseConfig, supabaseSecrets, type DeliveryResult, type DestinationAdapter } from "./types";

// The owner's own Supabase project, through its Data API (PostgREST).
// Rows: { response_id, form_id, submitted_at, data } — idempotent on response_id.
// Setup SQL: lib/destinations/sql.ts.

/** New-style keys (sb_publishable_/sb_secret_) go in `apikey` only; legacy JWT keys also as Bearer. */
export function supabaseHeaders(apiKey: string, schema: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: apiKey, Accept: "application/json" };
  if (!apiKey.startsWith("sb_")) headers.Authorization = `Bearer ${apiKey}`;
  if (schema !== "public") {
    headers["Accept-Profile"] = schema;
    headers["Content-Profile"] = schema;
  }
  return headers;
}

async function postgrestMessage(response: { text: () => Promise<string> }): Promise<string> {
  try {
    const body = JSON.parse(await response.text()) as { message?: string; code?: string };
    return [body.code, body.message].filter(Boolean).join(": ").slice(0, 200);
  } catch {
    return "";
  }
}

async function interpret(response: { status: number; text: () => Promise<string> }): Promise<DeliveryResult> {
  if (response.status >= 200 && response.status < 300) return success;
  const detail = await postgrestMessage(response);
  if (response.status === 401 || response.status === 403) return failure("Supabase refused the key. Check the key, or the table's insert policy.", false);
  if (response.status === 404) return failure("Supabase couldn't find that table. Check the schema and table name.", false);
  if (response.status >= 500 || response.status === 429) return failure(`Supabase had a problem (HTTP ${response.status}).`);
  return failure(`Supabase rejected the row${detail ? ` (${detail})` : ""}. Check the table matches the setup SQL.`, false);
}

function parse(destination: { config: unknown; secrets: unknown }) {
  const config = supabaseConfig.safeParse(destination.config);
  const secrets = supabaseSecrets.safeParse(destination.secrets);
  if (!config.success || !secrets.success) return null;
  const base = config.data.projectUrl.replace(/\/+$/, "");
  return { base, schema: config.data.schema, table: config.data.table, apiKey: secrets.data.apiKey };
}

export const supabaseAdapter: DestinationAdapter = {
  type: "supabase",
  async deliver(destination, { payload }) {
    const parsed = parse(destination);
    if (!parsed) return failure("This Supabase connection's settings are incomplete. Remove it and add it again.", false);
    const row = { response_id: payload.responseId, form_id: payload.form.id, submitted_at: payload.submittedAt, data: buildRowData(payload.answers) };
    const response = await guardedFetch(`${parsed.base}/rest/v1/${encodeURIComponent(parsed.table)}?on_conflict=response_id`, {
      method: "POST",
      headers: { ...supabaseHeaders(parsed.apiKey, parsed.schema), "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    return interpret(response);
  },
  async test(destination) {
    const parsed = parse(destination);
    if (!parsed) return failure("This Supabase connection's settings are incomplete. Remove it and add it again.", false);
    const response = await guardedFetch(`${parsed.base}/rest/v1/${encodeURIComponent(parsed.table)}?select=response_id&limit=1`, {
      method: "GET",
      headers: supabaseHeaders(parsed.apiKey, parsed.schema),
    });
    return interpret(response);
  },
};
