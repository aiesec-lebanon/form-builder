import "server-only";

import { FOLDER_MIME, GoogleApiError, inspectFile, SPREADSHEET_MIME } from "./api";
import type { DriveLocation, WantedKind } from "./links";

// A folder or Sheet the owner chose themselves (a pasted link or Google Picker),
// in My Drive or a shared drive. With the drive.file scope AIESEC Forms only
// sees files the owner has chosen with it, so a pasted link alone isn't enough:
// Google answers "not found" until the owner confirms that one file in Google's
// chooser. That case is "needsAccess", kept apart from real problems.

export type { DriveLocation };

export type LocationCheck = { ok: true; location: DriveLocation } | { ok: false; needsAccess: true } | { ok: false; needsAccess: false; message: string };

const EXCEL_MIMES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]);

const problem = (message: string): LocationCheck => ({ ok: false, needsAccess: false, message });

/** Drive's answers for "this app hasn't been given this file" (or the account can't see it at all). */
function notGivenToApp(error: unknown): boolean {
  if (!(error instanceof GoogleApiError)) return false;
  return error.status === 404 || (error.status === 403 && /appNotAuthorizedToFile|insufficientFilePermissions/i.test(error.reason));
}

/** Can responses or uploads be saved here? A folder must take new files; a Sheet must be a Google Sheet the account can edit. */
export async function checkLocation(token: string, fileId: string, want: WantedKind): Promise<LocationCheck> {
  let file: Awaited<ReturnType<typeof inspectFile>>;
  try {
    file = await inspectFile(token, fileId);
  } catch (error) {
    if (notGivenToApp(error)) return { ok: false, needsAccess: true };
    throw error;
  }
  const sharedDrive = Boolean(file.driveId);

  if (want === "folder") {
    if (file.mimeType !== FOLDER_MIME) return problem(file.mimeType === SPREADSHEET_MIME ? "That's a Sheet, not a folder. Choose a folder instead." : "That's a file, not a folder. Choose a folder instead.");
    if (file.trashed) return problem("That folder is in the Drive trash. Restore it, or choose another folder.");
    if (file.capabilities?.canAddChildren === false) {
      return problem(
        sharedDrive
          ? "You can only view that shared drive folder. Ask a manager of the shared drive to make you a Contributor, or choose another folder."
          : "You can't add files to that folder. Ask its owner for edit access, or choose another folder.",
      );
    }
    return { ok: true, location: { id: file.id, name: file.name, url: file.webViewLink ?? `https://drive.google.com/drive/folders/${encodeURIComponent(file.id)}`, sharedDrive } };
  }

  if (EXCEL_MIMES.has(file.mimeType)) return problem("That's an Excel file. Open it in Google Sheets, choose File → Save as Google Sheets, and use the new Sheet.");
  if (file.mimeType !== SPREADSHEET_MIME) return problem(file.mimeType === FOLDER_MIME ? "That's a folder, not a Sheet. Choose a Sheet instead." : "That isn't a Google Sheet. Choose a Sheet instead.");
  if (file.trashed) return problem("That Sheet is in the Drive trash. Restore it, or choose another Sheet.");
  if (file.capabilities?.canEdit === false) return problem("You can only view that Sheet. Ask its owner for edit access, or choose another Sheet.");
  return { ok: true, location: { id: file.id, name: file.name, url: file.webViewLink ?? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/edit`, sharedDrive } };
}
