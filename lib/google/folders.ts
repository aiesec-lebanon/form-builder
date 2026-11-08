import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import { createFolder, findFolder, getFile } from "./api";

// Where this app puts things in an owner's Drive:
//   AIESEC Forms / <form name> / <form name> Responses   (the Sheet)
//                              / <form name> <question> Uploads   (one per file question)
// Folders are tracked by id, so owners can move or rename them freely.

export const ROOT_FOLDER_NAME = "AIESEC Forms";
const MAX_NAME = 150;

const clean = (name: string, fallback: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME) || fallback;

/** A folder still exists and isn't in the trash. */
async function usable(token: string, folderId: string): Promise<{ webViewLink?: string } | null> {
  try {
    const file = await getFile(token, folderId);
    return file.trashed ? null : { webViewLink: file.webViewLink };
  } catch {
    return null;
  }
}

/** The account's "AIESEC Forms" folder, made the first time it's needed (again if trashed). */
export async function ensureRootFolder(token: string, connectionId: string): Promise<string> {
  const connection = await db.googleConnection.findUnique({ where: { id: connectionId }, select: { rootFolderId: true } });
  if (connection?.rootFolderId && (await usable(token, connection.rootFolderId))) return connection.rootFolderId;
  const id = (await findFolder(token, ROOT_FOLDER_NAME, "root"))?.id ?? (await createFolder(token, ROOT_FOLDER_NAME)).id;
  await db.googleConnection.update({ where: { id: connectionId }, data: { rootFolderId: id } });
  return id;
}

export type FormFolder = { id: string; url: string; name: string; /** The form's name when another folder already had it. */ takenName: string | null };

/**
 * The form's folder inside AIESEC Forms. Reuses the one another Google
 * destination of this form already made on the same account.
 */
export async function ensureFormFolder(token: string, input: { connectionId: string; formId: string; title: string }): Promise<FormFolder> {
  const siblings = await db.destination.findMany({ where: { formId: input.formId, googleConnectionId: input.connectionId }, select: { config: true } });
  for (const sibling of siblings) {
    const id = (sibling.config as Record<string, unknown> | null)?.formFolderId;
    if (typeof id !== "string") continue;
    const folder = await usable(token, id);
    if (folder) return { id, url: folder.webViewLink ?? `https://drive.google.com/drive/folders/${id}`, name: "", takenName: null };
  }

  const rootId = await ensureRootFolder(token, input.connectionId);
  const base = clean(input.title, "Untitled form");
  let name = base;
  for (let attempt = 2; attempt <= 50 && (await findFolder(token, name, rootId)); attempt += 1) name = `${base} (${attempt})`;
  const folder = await createFolder(token, name, rootId);
  return { id: folder.id, url: folder.webViewLink, name, takenName: name === base ? null : base };
}

/** The uploads folder for one file question, made inside the form's folder on its first upload. */
export async function ensureQuestionFolder(
  token: string,
  input: { destinationId: string; formFolderId: string; known: string | undefined; formTitle: string; question: { id: string; label: string } },
): Promise<string> {
  if (input.known && (await usable(token, input.known))) return input.known;
  const name = clean(`${clean(input.formTitle, "Untitled form")} ${clean(input.question.label, "File upload")} Uploads`, "Uploads");
  const folder = await createFolder(token, name, input.formFolderId);
  // Re-read before saving so folders made for other questions in the meantime aren't lost.
  const row = await db.destination.findUnique({ where: { id: input.destinationId }, select: { config: true } });
  const config = (row?.config ?? {}) as Record<string, unknown>;
  const questionFolders = { ...((config.questionFolders as Record<string, string> | undefined) ?? {}), [input.question.id]: folder.id };
  await db.destination.update({ where: { id: input.destinationId }, data: { config: { ...config, questionFolders } as Prisma.InputJsonValue } });
  return folder.id;
}

/** What to tell the owner when the form's name was already taken in AIESEC Forms. */
export function folderNotice(folder: FormFolder): string | null {
  return folder.takenName ? `A folder named "${folder.takenName}" already exists in ${ROOT_FOLDER_NAME}, so this form's files are in "${folder.name}".` : null;
}
