import "server-only";

import { classifyError } from "@/lib/destinations/errors";
import { loadDestinations } from "@/lib/destinations/store";
import { driveConfig } from "@/lib/destinations/types";
import type { AnswerValue, FileAnswer, ResolvedFile } from "@/lib/forms/fields";
import type { Field } from "@/lib/forms/schema";
import { getFile } from "@/lib/google/api";
import { googleAccessToken } from "@/lib/google/tokens";

// Server side of browser-to-Drive uploads (ADR-004).

/** A Drive-safe file name, prefixed with the response so the owner can match files. */
export function driveFileName(responseId: string, original: string): string {
  const clean = original
    .replace(/[\u0000-\u001f\u007f/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return `${responseId.slice(0, 8)} - ${clean || "upload"}`;
}

export async function filesDestination(formId: string) {
  const [drive] = await loadDestinations(formId, ["files"]);
  if (!drive?.googleConnectionId) return null;
  const config = driveConfig.safeParse(drive.config);
  return config.success ? { connectionId: drive.googleConnectionId, folderId: config.data.folderId } : null;
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
              meta.parents?.includes(storage.folderId) &&
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
