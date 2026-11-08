import "server-only";

// Minimal Google Sheets + Drive REST client (no SDK: smaller, explicit).

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

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

export async function createSpreadsheet(token: string, title: string, headers: string[]): Promise<CreatedSpreadsheet> {
  const body = {
    properties: { title },
    sheets: [
      {
        properties: { title: "Responses", gridProperties: { frozenRowCount: 1 } },
        data: [
          {
            startRow: 0,
            startColumn: 0,
            rowData: [{ values: headers.map((header) => ({ userEnteredValue: { stringValue: header }, userEnteredFormat: { textFormat: { bold: true } } })) }],
          },
        ],
      },
    ],
  };
  const created = await call<{ spreadsheetId: string; spreadsheetUrl: string; sheets: Array<{ properties: { sheetId: number; title: string } }> }>(token, SHEETS, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return { spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl, sheetId: created.sheets[0].properties.sheetId, sheetTitle: created.sheets[0].properties.title };
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

export async function sheetTitleById(token: string, spreadsheetId: string, sheetId: number): Promise<string | null> {
  const data = await call<{ sheets?: Array<{ properties: { sheetId: number; title: string } }> }>(token, `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  return data.sheets?.find((sheet) => sheet.properties.sheetId === sheetId)?.properties.title ?? null;
}

export const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function createFolder(token: string, name: string, parentId?: string): Promise<{ id: string; webViewLink: string }> {
  return call(token, `${DRIVE}?fields=id,webViewLink`, { method: "POST", body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }) });
}

/** Drive query string literal: quotes and backslashes escaped. */
export const driveLiteral = (value: string) => `'${value.replace(/['\\]/g, "\\$&")}'`;

/** A folder this app created with this exact name in a parent ("root" = My Drive), or null. */
export async function findFolder(token: string, name: string, parentId: string): Promise<{ id: string; webViewLink?: string } | null> {
  const params = new URLSearchParams({
    q: `name = ${driveLiteral(name)} and mimeType = '${FOLDER_MIME}' and ${driveLiteral(parentId)} in parents and trashed = false`,
    fields: "files(id,webViewLink)",
    pageSize: "1",
  });
  const result = await call<{ files?: Array<{ id: string; webViewLink?: string }> }>(token, `${DRIVE}?${params.toString()}`);
  return result.files?.[0] ?? null;
}

/** Moves a file this app created into a folder. */
export async function moveToFolder(token: string, fileId: string, folderId: string): Promise<void> {
  const file = await getFile(token, fileId);
  const params = new URLSearchParams({ addParents: folderId, fields: "id" });
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
};

export async function getFile(token: string, fileId: string): Promise<DriveFile> {
  return call(token, `${DRIVE}/${encodeURIComponent(fileId)}?fields=id,name,size,mimeType,parents,webViewLink,appProperties,trashed`);
}

/** Renames a file and/or sets its app properties in one call. */
export async function updateFile(token: string, fileId: string, patch: { name?: string; appProperties?: Record<string, string> }): Promise<void> {
  await call(token, `${DRIVE}/${encodeURIComponent(fileId)}?fields=id`, { method: "PATCH", body: JSON.stringify(patch) });
}

/**
 * Starts a resumable upload the browser finishes on its own (ADR-004). The
 * declared size is enforced by Google; `origin` enables CORS for that browser.
 */
export async function startResumableUpload(
  token: string,
  input: { folderId: string; name: string; mimeType: string; size: number; origin: string; appProperties: Record<string, string> },
): Promise<string> {
  const response = await fetch(`${UPLOAD}?uploadType=resumable&fields=id,name,size,mimeType`, {
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
  });
  if (pageToken) params.set("pageToken", pageToken);
  return call(token, `${DRIVE}?${params.toString()}`);
}

/** Moves a file to the owner's Drive trash (restorable for 30 days). */
export async function trashFile(token: string, fileId: string): Promise<void> {
  await call(token, `${DRIVE}/${encodeURIComponent(fileId)}?fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
}
