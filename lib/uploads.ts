import "server-only";

import { classifyError } from "@/lib/destinations/errors";
import { loadDestinations } from "@/lib/destinations/store";
import { driveConfig } from "@/lib/destinations/types";
import { collectsAnswer, definitionFor, type AnswerValue, type FileAnswer, type ResolvedFile } from "@/lib/forms/fields";
import { allFields, type Field, type FormDocument } from "@/lib/forms/schema";
import { db } from "@/lib/db";
import { getFile, listFolderFiles, trashFile, updateFile } from "@/lib/google/api";
import { googleAccessToken } from "@/lib/google/tokens";
import { logger } from "@/lib/logger";

// Server side of browser-to-Drive uploads (ADR-004).

const safeName = (text: string) =>
  text
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The name a file is uploaded with: the person's own file name, made Drive-safe. Renamed later if the owner set a naming format. */
export function driveFileName(original: string): string {
  return safeName(original).slice(0, 200) || "upload";
}

/** ".pdf" from "cv.final.pdf"; "" when there's no sensible extension. */
export function extensionOf(name: string): string {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim());
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * New names for a response's uploads from the owner's naming format (e.g.
 * "Lina Haddad_1.pdf"). Questions without an answer are skipped; with no
 * answers at all the original name stays. Every file is listed, so all get
 * marked as part of a sent response.
 */
export function plannedUploadNames(doc: FormDocument, values: Record<string, AnswerValue | null>): Array<{ fileId: string; name: string | null }> {
  const fields = allFields(doc);
  const planned: Array<{ fileId: string; name: string | null }> = [];
  for (const field of fields) {
    if (field.type !== "file_upload") continue;
    const files = (values[field.id] as FileAnswer[] | null | undefined) ?? [];
    const naming = field.naming;
    const parts = (naming?.fieldIds ?? [])
      .map((id) => fields.find((candidate) => candidate.id === id))
      .map((source) => {
        const value = source ? values[source.id] : null;
        if (!source || value === null || value === undefined || !collectsAnswer(source) || source.type === "file_upload") return "";
        return safeName(String(definitionFor(source).toCell(source, value))).slice(0, 60);
      })
      .filter(Boolean);
    files.forEach((file, index) => {
      if (!naming || parts.length === 0) return void planned.push({ fileId: file.fileId, name: null });
      const base = [...parts, ...(naming.index ? [String(index + 1)] : [])].join(naming.separator);
      planned.push({ fileId: file.fileId, name: `${base.slice(0, 180)}${extensionOf(file.name)}` });
    });
  }
  return planned;
}

export async function filesDestination(formId: string) {
  const [drive] = await loadDestinations(formId, ["files"]);
  if (!drive?.googleConnectionId) return null;
  const config = driveConfig.safeParse(drive.config);
  return config.success ? { destinationId: drive.id, connectionId: drive.googleConnectionId, folderId: config.data.folderId, questionFolders: config.data.questionFolders } : null;
}

export type ResolveResult =
  | { ok: true; values: Record<string, ResolvedFile[]> }
  | { ok: false; status: 422; fieldErrors: Record<string, string> }
  | { ok: false; status: 502; message: string };

/**
 * Checks each uploaded file really is in this form's folder, for this response
 * and question, then swaps the browser's claim for Drive's own metadata.
 */
export async function resolveUploadedFiles(input: { formId: string; responseId: string; fields: Field[]; values: Record<string, AnswerValue | null> }): Promise<ResolveResult> {
  const storage = await filesDestination(input.formId);
  if (!storage) return { ok: false, status: 502, message: "File uploads aren't set up for this form." };

  try {
    const token = await googleAccessToken(storage.connectionId);
    const folders = new Set([storage.folderId, ...Object.values(storage.questionFolders)]);
    const resolved: Record<string, ResolvedFile[]> = {};
    const fieldErrors: Record<string, string> = {};
    await Promise.all(
      input.fields.map(async (field) => {
        const files = (input.values[field.id] as FileAnswer[] | null) ?? [];
        const checked = await Promise.all(
          files.map(async (file) => {
            const meta = await getFile(token, file.fileId).catch(() => null);
            const belongs =
              meta &&
              !meta.trashed &&
              meta.parents?.some((parent) => folders.has(parent)) &&
              meta.appProperties?.responseId === input.responseId &&
              meta.appProperties?.fieldId === field.id &&
              meta.appProperties?.formId === input.formId;
            if (!belongs) return null;
            return {
              name: file.name,
              url: meta.webViewLink ?? `https://drive.google.com/file/d/${encodeURIComponent(meta.id)}/view`,
              size: Number(meta.size ?? file.size),
              mimeType: meta.mimeType,
            } satisfies ResolvedFile;
          }),
        );
        if (checked.some((file) => file === null)) fieldErrors[field.id] = "One of your files didn't finish uploading. Remove it and upload it again.";
        else resolved[field.id] = checked as ResolvedFile[];
      }),
    );
    if (Object.keys(fieldErrors).length > 0) return { ok: false, status: 422, fieldErrors };
    return { ok: true, values: resolved };
  } catch (error) {
    const result = classifyError(error);
    return { ok: false, status: 502, message: result.ok ? "Couldn't check the uploaded files." : result.message };
  }
}

// --- Abandoned uploads -----------------------------------------------------------
// A file is uploaded before its response is sent. Sent responses mark their
// files "submitted"; the daily cron moves files never marked after a week
// (people keep drafts for a while) to the owner's Drive trash, where they stay
// restorable for 30 days.

export const ORPHAN_AFTER_DAYS = 7;
const MAX_TRASHED_PER_FOLDER = 200;

/**
 * After a response was delivered: renames its files if the owner set a naming
 * format, and marks them so the abandoned-upload cleanup leaves them. Never throws.
 */
export async function finalizeUploads(formId: string, files: Array<{ fileId: string; name: string | null }>): Promise<void> {
  if (files.length === 0) return;
  try {
    const storage = await filesDestination(formId);
    if (!storage) return;
    const token = await googleAccessToken(storage.connectionId);
    await Promise.all(
      files.map((file) =>
        updateFile(token, file.fileId, { ...(file.name ? { name: file.name } : {}), appProperties: { submitted: "1" } }).catch((error) => logger.warn("uploads.finalize_failed", { formId, error })),
      ),
    );
  } catch (error) {
    logger.warn("uploads.finalize_failed", { formId, error });
  }
}

export type OrphanCleanup = { folders: number; trashed: number; failedFolders: number };

/** Trashes this app's uploads that never became part of a response. Never throws. */
export async function cleanOrphanedUploads(now = Date.now()): Promise<OrphanCleanup> {
  const cutoff = now - ORPHAN_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const result: OrphanCleanup = { folders: 0, trashed: 0, failedFolders: 0 };
  const folders = await db.destination.findMany({
    where: { type: "google_drive", role: "files", enabled: true, googleConnectionId: { not: null }, googleConnection: { status: "active" } },
    select: { id: true, formId: true, config: true, googleConnectionId: true },
  });
  for (const folder of folders) {
    const config = driveConfig.safeParse(folder.config);
    if (!config.success || !folder.googleConnectionId) continue;
    result.folders += 1;
    try {
      const token = await googleAccessToken(folder.googleConnectionId);
      let pageToken: string | undefined;
      let trashed = 0;
      do {
        const page = await listFolderFiles(token, config.data.folderId, pageToken);
        const orphans = page.files.filter((file) => file.appProperties?.aiesecForms === "1" && file.appProperties?.submitted !== "1" && Date.parse(file.createdTime) < cutoff);
        for (const file of orphans) {
          if (trashed >= MAX_TRASHED_PER_FOLDER) break;
          await trashFile(token, file.id);
          trashed += 1;
        }
        pageToken = trashed < MAX_TRASHED_PER_FOLDER ? page.nextPageToken : undefined;
      } while (pageToken);
      result.trashed += trashed;
    } catch (error) {
      result.failedFolders += 1;
      logger.warn("uploads.cleanup_failed", { destinationId: folder.id, formId: folder.formId, error });
    }
  }
  return result;
}
