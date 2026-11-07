import { z } from "zod";

import { FILE_KINDS, type FieldOf, type FileKind } from "../schema";
import { invalid, ok, type AnswerValue, type FieldDefinition, type FileAnswer, type ResolvedFile } from "./types";

// Date, time, scales, file upload, consent and display-only statements.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "11 January 2027", per the voice guide; identical on server and client. */
export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function isCalendarDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const date: FieldDefinition<FieldOf<"date">> = {
  type: "date",
  name: "Date",
  hint: "Birthday, availability, deadline",
  group: "datetime",
  collectsAnswer: true,
  create: (id) => ({ id, type: "date", label: "", description: "", required: false, min: null, max: null }),
  validate: (field, raw) => {
    if (raw === undefined || raw === null || raw === "") return ok(null);
    if (typeof raw !== "string" || !isCalendarDate(raw)) return invalid("Enter a date, like 11 January 2027.");
    if (field.min && raw < field.min) return invalid(`Enter a date on or after ${formatIsoDate(field.min)}.`);
    if (field.max && raw > field.max) return invalid(`Enter a date on or before ${formatIsoDate(field.max)}.`);
    return ok(raw);
  },
  requiredMessage: () => "Enter a date.",
  toOutput: (_field, value) => String(value),
  toCell: (_field, value) => String(value),
};

export const time: FieldDefinition<FieldOf<"time">> = {
  type: "time",
  name: "Time",
  hint: "Arrival, preferred slot",
  group: "datetime",
  collectsAnswer: true,
  create: (id) => ({ id, type: "time", label: "", description: "", required: false }),
  validate: (_field, raw) => {
    if (raw === undefined || raw === null || raw === "") return ok(null);
    const match = typeof raw === "string" ? raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/) : null;
    return match ? ok(`${match[1]}:${match[2]}`) : invalid("Enter a time, like 14:30.");
  },
  requiredMessage: () => "Enter a time.",
  toOutput: (_field, value) => String(value),
  toCell: (_field, value) => String(value),
};

function readInteger(raw: unknown): number | null | "invalid" {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isInteger(value) ? value : "invalid";
}

export const linearScale: FieldDefinition<FieldOf<"linear_scale">> = {
  type: "linear_scale",
  name: "Linear scale",
  hint: "How likely, how satisfied",
  group: "scale",
  collectsAnswer: true,
  create: (id) => ({ id, type: "linear_scale", label: "", description: "", required: false, min: 1, max: 5, minLabel: "", maxLabel: "" }),
  validate: (field, raw) => {
    const value = readInteger(raw);
    if (value === null) return ok(null);
    if (value === "invalid" || value < field.min || value > field.max) return invalid(`Choose a number from ${field.min} to ${field.max}.`);
    return ok(value);
  },
  requiredMessage: () => "Choose a number.",
  toOutput: (_field, value) => Number(value),
  toCell: (_field, value) => Number(value),
};

export const rating: FieldDefinition<FieldOf<"rating">> = {
  type: "rating",
  name: "Rating",
  hint: "Stars out of 5",
  group: "scale",
  collectsAnswer: true,
  create: (id) => ({ id, type: "rating", label: "", description: "", required: false, max: 5 }),
  validate: (field, raw) => {
    const value = readInteger(raw);
    if (value === null || value === 0) return ok(null);
    if (value === "invalid" || value < 1 || value > field.max) return invalid(`Choose a rating from 1 to ${field.max}.`);
    return ok(value);
  },
  requiredMessage: () => "Choose a rating.",
  toOutput: (_field, value) => Number(value),
  toCell: (_field, value) => Number(value),
};

// --- Files -------------------------------------------------------------------

const DOCUMENT_MIME = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/rtf",
  "text/plain",
];
const SPREADSHEET_MIME = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
];
const PRESENTATION_MIME = [
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
];
const ARCHIVE_MIME = ["application/zip", "application/x-zip-compressed", "application/x-7z-compressed", "application/vnd.rar", "application/x-rar-compressed", "application/gzip", "application/x-tar"];

const MIME_MATCHERS: Record<FileKind, (mime: string) => boolean> = {
  image: (mime) => mime.startsWith("image/"),
  video: (mime) => mime.startsWith("video/"),
  audio: (mime) => mime.startsWith("audio/"),
  pdf: (mime) => mime === "application/pdf",
  document: (mime) => DOCUMENT_MIME.includes(mime),
  spreadsheet: (mime) => SPREADSHEET_MIME.includes(mime),
  presentation: (mime) => PRESENTATION_MIME.includes(mime),
  archive: (mime) => ARCHIVE_MIME.includes(mime),
};

/** `accept` attribute values for the file input. */
export const FILE_KIND_ACCEPT: Record<FileKind, string> = {
  image: "image/*",
  video: "video/*",
  audio: "audio/*",
  pdf: ".pdf,application/pdf",
  document: ".doc,.docx,.odt,.rtf,.txt",
  spreadsheet: ".xls,.xlsx,.ods,.csv",
  presentation: ".ppt,.pptx,.odp",
  archive: ".zip,.7z,.rar,.gz,.tar",
};

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: "Images",
  video: "Videos",
  audio: "Audio",
  pdf: "PDF",
  document: "Documents",
  spreadsheet: "Spreadsheets",
  presentation: "Presentations",
  archive: "Archives",
};

export function fileTypeAllowed(accept: readonly FileKind[], mimeType: string): boolean {
  if (accept.length === 0) return true;
  const mime = mimeType.toLowerCase();
  return accept.some((kind) => MIME_MATCHERS[kind](mime));
}

export const MAX_FILE_NAME = 255;
export const bytesFromMb = (mb: number) => mb * 1024 * 1024;

const fileAnswerSchema = z.object({
  fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
  name: z.string().min(1).max(MAX_FILE_NAME),
  size: z.number().int().min(0),
  mimeType: z.string().max(255),
});

const isResolved = (file: FileAnswer | ResolvedFile): file is ResolvedFile => "url" in file;

export const fileUpload: FieldDefinition<FieldOf<"file_upload">> = {
  type: "file_upload",
  name: "File upload",
  hint: "CV, photo, video. Saved to your Drive",
  group: "other",
  collectsAnswer: true,
  create: (id) => ({ id, type: "file_upload", label: "", description: "", required: false, maxFiles: 1, maxSizeMb: 10, accept: [] }),
  validate: (field, raw) => {
    if (raw === undefined || raw === null) return ok(null);
    const parsed = z.array(fileAnswerSchema).max(10).safeParse(raw);
    if (!parsed.success) return invalid("Upload the file again.");
    const files = parsed.data.filter((file, index, list) => list.findIndex((other) => other.fileId === file.fileId) === index);
    if (files.length === 0) return ok(null);
    if (files.length > field.maxFiles) return invalid(`Upload up to ${field.maxFiles} file${field.maxFiles === 1 ? "" : "s"}.`);
    for (const file of files) {
      if (file.size > bytesFromMb(field.maxSizeMb)) return invalid(`Each file can be up to ${field.maxSizeMb} MB.`);
      if (!fileTypeAllowed(field.accept, file.mimeType)) return invalid("That file type isn't accepted here.");
    }
    return ok(files);
  },
  requiredMessage: () => "Upload a file.",
  toOutput: (_field, value) => {
    const files = value as Array<FileAnswer | ResolvedFile>;
    return files.every(isResolved) ? (files as ResolvedFile[]) : (files as FileAnswer[]);
  },
  toCell: (_field, value) =>
    (value as Array<FileAnswer | ResolvedFile>).map((file) => (isResolved(file) ? file.url : file.name)).join("\n"),
};

export const consent: FieldDefinition<FieldOf<"consent">> = {
  type: "consent",
  name: "Consent",
  hint: "Terms, privacy, permission",
  group: "other",
  collectsAnswer: true,
  create: (id) => ({ id, type: "consent", label: "", description: "", required: true, checkboxLabel: "I agree" }),
  validate: (_field, raw) => (raw === true ? ok(true) : ok(null)),
  requiredMessage: () => "Tick the box to continue.",
  toOutput: () => true,
  toCell: () => "Yes",
};

export const statement: FieldDefinition<FieldOf<"statement">> = {
  type: "statement",
  name: "Text block",
  hint: "A heading or instructions, no answer",
  group: "other",
  collectsAnswer: false,
  create: (id) => ({ id, type: "statement", label: "", description: "", required: false }),
  validate: () => ok(null),
  requiredMessage: () => "",
  toOutput: () => "",
  toCell: () => "",
};

export { FILE_KINDS };
export type { AnswerValue };
