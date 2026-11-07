import type { Field } from "../schema";

// Shared contracts for field-type modules (ADR-006).

/** A file the browser uploaded to Drive, as sent with a submission. */
export type FileAnswer = { fileId: string; name: string; size: number; mimeType: string };
/** A file after the server verified it in the owner's Drive. */
export type ResolvedFile = { name: string; url: string; size: number; mimeType: string };

/** Choice answers: selected option ids, and `other` (non-null = "Other" chosen). */
export type ChoiceValue = { optionIds: string[]; other: string | null };

/** A validated, normalized answer. `null` means "not answered". */
export type AnswerValue = string | number | boolean | ChoiceValue | FileAnswer[] | ResolvedFile[];

/** What destinations receive for one answer. */
export type OutputValue = string | number | boolean | string[] | ResolvedFile[] | Array<Omit<FileAnswer, "fileId"> & { fileId: string }>;

export type ValidationResult = { ok: true; value: AnswerValue | null } | { ok: false; error: string };

export type FieldGroup = "text" | "choice" | "scale" | "datetime" | "other";

export type FieldDefinition<F extends Field> = {
  type: F["type"];
  /** Palette name, sentence case. */
  name: string;
  /** One-line hint in the palette. */
  hint: string;
  group: FieldGroup;
  /** False for display-only blocks (statement). */
  collectsAnswer: boolean;
  /** A new field with sensible defaults (label left empty for the owner to type). */
  create: (id: string) => F;
  /** Shape + rule checks; returns null for "no answer" (required is checked centrally). */
  validate: (field: F, raw: unknown) => ValidationResult;
  /** Message when a required answer is missing, in the reader's terms. */
  requiredMessage: (field: F) => string;
  toOutput: (field: F, value: AnswerValue) => OutputValue;
  toCell: (field: F, value: AnswerValue) => string | number | boolean;
};

export const ok = (value: AnswerValue | null): ValidationResult => ({ ok: true, value });
export const invalid = (error: string): ValidationResult => ({ ok: false, error });
