import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { appendRow, GoogleApiError, sheetTitleById, writeHeaderRow } from "@/lib/google/api";
import { googleAccessToken } from "@/lib/google/tokens";
import { buildCells, fieldHeaders } from "@/lib/forms/payload";
import type { FormDocument } from "@/lib/forms/schema";

import { classifyError } from "./errors";
import { failure, sheetsConfig, success, type DestinationAdapter, type LoadedDestination, type SheetsConfig } from "./types";

// Google Sheets (spec §11). Columns are mapped by field id and only ever
// appended, so existing data never shifts. Values are written RAW.

export const SUBMITTED_HEADER = "Submitted at";
export const RESPONSE_ID_HEADER = "Response ID";

/** Pure + deterministic: existing columns keep their place (labels refresh), new questions append. */
export function syncColumns(columns: SheetsConfig["columns"], doc: FormDocument) {
  const next = columns.map((column) => ({ ...column }));
  for (const { fieldId, header } of fieldHeaders(doc)) {
    const existing = next.find((column) => column.fieldId === fieldId);
    if (existing) existing.header = header;
    else next.push({ fieldId, header });
  }
  return { columns: next, headerRow: [SUBMITTED_HEADER, RESPONSE_ID_HEADER, ...next.map((column) => column.header)] };
}

/** "2026-11-08 14:32:05 UTC": sortable, unambiguous, safe as RAW text. */
export function sheetTimestamp(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

export function initialHeaderRow(doc: FormDocument): string[] {
  return syncColumns([], doc).headerRow;
}

async function saveConfig(destinationId: string, config: SheetsConfig): Promise<void> {
  await db.destination.update({ where: { id: destinationId }, data: { config: config as unknown as Prisma.InputJsonValue } });
}

/** Runs a Sheets call; if the tab was renamed, finds it by id and retries once. */
async function withTab<T>(token: string, destinationId: string, config: SheetsConfig, run: (title: string) => Promise<T>): Promise<{ result: T; config: SheetsConfig }> {
  try {
    return { result: await run(config.sheetTitle), config };
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 400 || !/parse range/i.test(error.message)) throw error;
    const title = await sheetTitleById(token, config.spreadsheetId, config.sheetId);
    if (!title) throw new GoogleApiError(404, "tabMissing", "The responses tab was deleted");
    const renamed = { ...config, sheetTitle: title };
    await saveConfig(destinationId, renamed);
    return { result: await run(title), config: renamed };
  }
}

function parse(destination: LoadedDestination): SheetsConfig | null {
  const parsed = sheetsConfig.safeParse(destination.config);
  return parsed.success && destination.googleConnectionId ? parsed.data : null;
}

async function syncHeaders(token: string, destination: LoadedDestination, config: SheetsConfig, doc: FormDocument): Promise<SheetsConfig> {
  const { columns, headerRow } = syncColumns(config.columns, doc);
  const { config: current } = await withTab(token, destination.id, config, (title) => writeHeaderRow(token, config.spreadsheetId, title, headerRow));
  const updated = { ...current, columns };
  await saveConfig(destination.id, updated);
  return updated;
}

const INCOMPLETE = "This Google Sheet connection is incomplete. Remove it and add it again.";

export const googleSheetsAdapter: DestinationAdapter = {
  type: "google_sheets",
  async prepare(destination, doc) {
    const config = parse(destination);
    if (!config) return failure(INCOMPLETE, false);
    try {
      const token = await googleAccessToken(destination.googleConnectionId as string);
      await syncHeaders(token, destination, config, doc);
      return success;
    } catch (error) {
      return classifyError(error);
    }
  },
  async deliver(destination, { payload, doc, values }) {
    let config = parse(destination);
    if (!config) return failure(INCOMPLETE, false);
    const token = await googleAccessToken(destination.googleConnectionId as string);
    const known = new Set(config.columns.map((column) => column.fieldId));
    // Published before the columns could be prepared: catch up now (idempotent).
    if (fieldHeaders(doc).some((header) => !known.has(header.fieldId))) config = await syncHeaders(token, destination, config, doc);
    const cells = buildCells(doc, values, payload.respondent);
    const row = [sheetTimestamp(payload.submittedAt), payload.responseId, ...config.columns.map((column) => cells[column.fieldId] ?? "")];
    const sheet = config;
    await withTab(token, destination.id, sheet, (title) => appendRow(token, sheet.spreadsheetId, title, row));
    return success;
  },
  async test(destination) {
    const config = parse(destination);
    if (!config) return failure(INCOMPLETE, false);
    const token = await googleAccessToken(destination.googleConnectionId as string);
    const title = await sheetTitleById(token, config.spreadsheetId, config.sheetId);
    return title ? success : failure("The responses tab was deleted. Remove this Sheet and connect a new one.", false);
  },
};
