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

/** RAW input: text like "=SUM(A1)" is stored as text, never run as a formula. */
export async function appendRow(token: string, spreadsheetId: string, sheetTitle: string, row: Array<string | number | boolean>): Promise<void> {
  const range = encodeURIComponent(a1(sheetTitle, "A1"));
  await call(token, `${SHEETS}/${spreadsheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [row] }),
  });
}

export async function sheetTitleById(token: string, spreadsheetId: string, sheetId: number): Promise<string | null> {
  const data = await call<{ sheets?: Array<{ properties: { sheetId: number; title: string } }> }>(token, `${SHEETS}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  return data.sheets?.find((sheet) => sheet.properties.sheetId === sheetId)?.properties.title ?? null;
}

export async function createFolder(token: string, name: string): Promise<{ id: string; webViewLink: string }> {
  return call(token, `${DRIVE}?fields=id,webViewLink`, { method: "POST", body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }) });
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

export async function setFileProperties(token: string, fileId: string, appProperties: Record<string, string>): Promise<void> {
  await call(token, `${DRIVE}/${encodeURIComponent(fileId)}?fields=id`, { method: "PATCH", body: JSON.stringify({ appProperties }) });
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
