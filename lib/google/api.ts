import "server-only";

// Minimal Google Sheets + Drive REST client (no SDK: smaller, explicit).
// Drive calls include shared drives: folders and Sheets can live in an entity's
// shared drive as well as in someone's My Drive (drive.file covers both).

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
/** Single-file Drive calls: also find files that live in shared drives. */
const ALL_DRIVES = "supportsAllDrives=true";
/** Drive searches: look in My Drive and the shared drives the account belongs to. */
const SEARCH_ALL_DRIVES = { supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "allDrives" };

export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

async function call<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
    throw new GoogleApiError(response.status, reason, (body?.error?.message ?? `Google responded ${response.status}`).slice(0, 200));
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** 'Tab name'!A1 notation with quotes escaped. */
export function a1(sheetTitle: string, range: string): string {
  return `'${sheetTitle.replace(/'/g, "''")}'!${range}`;
}

export type CreatedSpreadsheet = { spreadsheetId: string; spreadsheetUrl: string; sheetId: number; sheetTitle: string };

export const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

/**
 * A new spreadsheet created straight inside a folder (in My Drive or a shared
 * drive), so it never has to be moved: moving into a shared drive can need more
 * rights than adding. Its first tab becomes "Responses" with the header row.
 */
export async function createSpreadsheet(token: string, input: { title: string; headers: string[]; folderId: string }): Promise<CreatedSpreadsheet> {
  const file = await call<{ id: string }>(token, `${DRIVE}?${ALL_DRIVES}&fields=id`, {
    method: "POST",
    body: JSON.stringify({ name: input.title, mimeType: SPREADSHEET_MIME, parents: [input.folderId] }),
  });
  const info = await getSpreadsheet(token, file.id);
  const sheetId = info.sheets[0]?.sheetId ?? 0;
  await call(token, `${SHEETS}/${encodeURIComponent(file.id)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ updateSheetProperties: { properties: { sheetId, title: "Responses", gridProperties: { frozenRowCount: 1 } }, fields: "title,gridProperties.frozenRowCount" } }] }),
  });
  await writeHeaderRow(token, file.id, "Responses", input.headers);
  return { spreadsheetId: file.id, spreadsheetUrl: info.spreadsheetUrl, sheetId, sheetTitle: "Responses" };
}

export async function writeHeaderRow(token: string, spreadsheetId: string, sheetTitle: string, headers: string[]): Promise<void> {
  const range = encodeURIComponent(a1(sheetTitle, "1:1"));
  await call(token, `${SHEETS}/${spreadsheetId}/values/${range}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ values: [headers] }) });
}

/**
 * RAW input: text like "=SUM(A1)" is stored as text, never run as a formula.
 * OVERWRITE fills the next empty row (already formatted as a normal row) instead
 * of inserting one that copies the bold header's style.
 */
export async function appendRow(token: string, spreadsheetId: string, sheetTitle: string, row: Array<string | number | boolean>): Promise<void> {
  const range = encodeURIComponent(a1(sheetTitle, "A1"));
  await call(token, `${SHEETS}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=OVERWRITE`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

export type SpreadsheetInfo = { spreadsheetId: string; spreadsheetUrl: string; title: string; sheets: Array<{ sheetId: number; title: string }> };

/** A spreadsheet the owner made with us or picked in Google Picker. */
export async function getSpreadsheet(token: string, spreadsheetId: string): Promise<SpreadsheetInfo> {
  const fields = "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title)";
  const data = await call<{ spreadsheetId: string; spreadsheetUrl: string; properties: { title: string }; sheets?: Array<{ properties: { sheetId: number; title: string } }> }>(
    token,
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(fields)}`,
  );
  return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl, title: data.properties.title, sheets: (data.sheets ?? []).map((sheet) => sheet.properties) };
}

/** Adds a tab with a frozen header row. */
export async function addSheetTab(token: string, spreadsheetId: string, title: string): Promise<{ sheetId: number; title: string }> {
  const result = await call<{ replies: Array<{ addSheet: { properties: { sheetId: number; title: string } } }> }>(token, `${SHEETS}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] }),
  });
  const { sheetId, title: created } = result.replies[0].addSheet.properties;
  return { sheetId, title: created };
}

/** A tab title not used yet in the spreadsheet (titles are unique regardless of case). */
export function uniqueTabTitle(base: string, existing: string[]): string {
  const taken = new Set(existing.map((title) => title.toLowerCase()));
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Responses";
  let title = clean;
  for (let attempt = 2; taken.has(title.toLowerCase()); attempt += 1) title = `${clean} (${attempt})`;
  return title;
}

export async function sheetTitleById(token: string, spreadsheetId: string, sheetId: number): Promise<string | null> {
  const data = await call<{ sheets?: Array<{ properties: { sheetId: number; title: string } }> }>(token, `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  return data.sheets?.find((sheet) => sheet.properties.sheetId === sheetId)?.properties.title ?? null;
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function createFolder(token: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string }> {
  return call(token, `${DRIVE}?${ALL_DRIVES}&fields=id,webViewLink`, { method: "POST", body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }) });
}

/** Drive query string literal: quotes and backslashes escaped. */
export const driveLiteral = (value: string) => `'${value.replace(/['\\]/g, "\\$&")}'`;

/** A folder this app created with this exact name in a parent ("root" = My Drive; shared-drive folders work too), or null. */
export async function findFolder(token: string, name: string, parentId: string): Promise<{ id: string; webViewLink?: string } | null> {
  const params = new URLSearchParams({
    q: `name = ${driveLiteral(name)} and mimeType = '${FOLDER_MIME}' and ${driveLiteral(parentId)} in parents and trashed = false`,
    fields: "files(id,webViewLink)",
    pageSize: "1",
    ...SEARCH_ALL_DRIVES,
  });
  const result = await call<{ files?: Array<{ id: string; webViewLink?: string }> }>(token, `${DRIVE}?${params.toString()}`);
  return result.files?.[0] ?? null;
}

/** Moves a file this app created into a folder. */
export async function moveToFolder(token: string, fileId: string, folderId: string): Promise<void> {
  const file = await getFile(token, fileId);
  const params = new URLSearchParams({ addParents: folderId, fields: "id", supportsAllDrives: "true" });
  const others = (file.parents ?? []).filter((parent) => parent !== folderId);
  if (others.length) params.set("removeParents", others.join(","));
  await call(token, `${DRIVE}/${encodeURIComponent(fileId)}?${params.toString()}`, { method: "PATCH", body: JSON.stringify({}) });
}

/** Column width for a header: roughly its text width, within sensible bounds. */
export const headerWidth = (header: string) => Math.min(360, Math.max(100, Math.round(header.length * 7.5 + 28)));

/**
 * Header row bold, every other row normal (new rows never inherit the header's
 * style) and each column as wide as its header.
 */
export async function formatSheet(token: string, spreadsheetId: string, sheetId: number, headers: string[]): Promise<void> {
  const requests: unknown[] = [
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { repeatCell: { range: { sheetId, startRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: false } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
    ...headers.map((header, index) => ({
      updateDimensionProperties: { range: { sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 }, properties: { pixelSize: headerWidth(header) }, fields: "pixelSize" },
    })),
  ];
  await call(token, `${SHEETS}/${spreadsheetId}:batchUpdate`, { method: "POST", body: JSON.stringify({ requests }) });
}

export type DriveFile = {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  appProperties?: Record<string, string>;
  trashed?: boolean;
  /** Set when the file lives in a shared drive. */
  driveId?: string;
};

export async function getFile(token: string, fileId: string): Promise<DriveFile> {
  return call(token, `${DRIVE}/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id,name,size,mimeType,parents,webViewLink,appProperties,trashed,driveId`);
}

/** Renames a file and/or sets its app properties in one call. */
export async function updateFile(token: string, fileId: string, patch: { name?: string; appProperties?: Record<string, string> }): Promise<void> {
  await call(token, `${DRIVE}/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id`, { method: "PATCH", body: JSON.stringify(patch) });
}

/**
 * Starts a resumable upload the browser finishes on its own (ADR-004). The
 * declared size is enforced by Google; `origin` enables CORS for that browser.
 */
export async function startResumableUpload(
  token: string,
  input: { folderId: string; name: string; mimeType: string; size: number; origin: string; appProperties: Record<string, string> },
): Promise<string> {
  const response = await fetch(`${UPLOAD}?uploadType=resumable&${ALL_DRIVES}&fields=id,name,size,mimeType`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": input.mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(input.size),
      Origin: input.origin,
    },
    body: JSON.stringify({ name: input.name, parents: [input.folderId], appProperties: input.appProperties }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const location = response.headers.get("location");
  if (!response.ok || !location) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string; errors?: Array<{ reason?: string }> } } | null;
    throw new GoogleApiError(response.status, body?.error?.errors?.[0]?.reason ?? "", body?.error?.message?.slice(0, 200) ?? "Google didn't start the upload");
  }
  return location;
}

export type ListedFile = { id: string; createdTime: string; appProperties?: Record<string, string> };

/** Files this app created in a folder (drive.file only ever sees our own files). */
export async function listFolderFiles(token: string, folderId: string, pageToken?: string): Promise<{ files: ListedFile[]; nextPageToken?: string }> {
  const params = new URLSearchParams({
    q: `'${folderId.replace(/['\\]/g, "\\$&")}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,createdTime,appProperties)",
    pageSize: "200",
    orderBy: "createdTime",
    ...SEARCH_ALL_DRIVES,
  });
  if (pageToken) params.set("pageToken", pageToken);
  return call(token, `${DRIVE}?${params.toString()}`);
}

/** Moves a file to the trash (restorable for 30 days). In a shared drive this needs the Content manager role. */
export async function trashFile(token: string, fileId: string): Promise<void> {
  await call(token, `${DRIVE}/${encodeURIComponent(fileId)}?${ALL_DRIVES}&fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
}
