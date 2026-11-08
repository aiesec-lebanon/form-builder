import { collectsAnswer, definitionFor, type AnswerValue, type OutputValue } from "./fields";
import { gridRowCell, gridRowLabel } from "./fields/grid";
import { allFields, isGridField, type FieldType, type FormDocument } from "./schema";

// What destinations receive (spec §10). Built from the published document and
// validated values; never logged, never stored by us.

export type PayloadAnswer = { fieldId: string; label: string; type: FieldType; value: OutputValue | null };

/** Who answered an AIESEC-only form, when its owner records it (ADR-013). */
export type RespondentInfo = { aiesecId: string; name: string; email: string | null };

export type ResponsePayload = {
  responseId: string;
  submittedAt: string;
  form: { id: string; title: string; slug: string };
  /** Null unless the form asks people to sign in with AIESEC and records who responded. */
  respondent: RespondentInfo | null;
  answers: PayloadAnswer[];
};

/** Sheet and row keys for the respondent, kept apart from field ids ("f_…"). */
export const RESPONDENT_COLUMNS: Array<{ key: string; header: string; pick: (respondent: RespondentInfo) => string }> = [
  { key: "respondent.name", header: "Name", pick: (respondent) => respondent.name },
  { key: "respondent.email", header: "Email", pick: (respondent) => respondent.email ?? "" },
  { key: "respondent.aiesecId", header: "AIESEC ID", pick: (respondent) => respondent.aiesecId },
];

export function recordsRespondent(doc: FormDocument): boolean {
  return doc.settings.access.mode === "aiesec" && doc.settings.access.recordRespondent;
}

const labelOf = (label: string, index: number) => label.trim() || `Question ${index + 1}`;

/** Every answer-collecting question in order, with null for unanswered ones (stable shape). */
export function buildAnswers(doc: FormDocument, values: Record<string, AnswerValue | null>): PayloadAnswer[] {
  return allFields(doc)
    .filter(collectsAnswer)
    .map((field, index) => {
      const value = values[field.id];
      return {
        fieldId: field.id,
        label: labelOf(field.label, index),
        type: field.type,
        value: value === null || value === undefined ? null : definitionFor(field).toOutput(field, value),
      };
    });
}

export function buildPayload(input: {
  responseId: string;
  submittedAt: Date;
  form: { id: string; slug: string };
  doc: FormDocument;
  values: Record<string, AnswerValue | null>;
  respondent?: RespondentInfo | null;
}): ResponsePayload {
  return {
    responseId: input.responseId,
    submittedAt: input.submittedAt.toISOString(),
    form: { id: input.form.id, title: input.doc.title, slug: input.form.slug },
    respondent: recordsRespondent(input.doc) ? (input.respondent ?? null) : null,
    answers: buildAnswers(input.doc, input.values),
  };
}

// Spreadsheet columns are keyed by field id, except grids: one column per row,
// keyed "fieldId.rowId" and headed "Question [Row]" (as Google Forms does), so
// each row can be sorted and charted on its own.
export const gridColumnKey = (fieldId: string, rowId: string) => `${fieldId}.${rowId}`;

/** Spreadsheet cell text per column key (formulas never execute: values are written RAW). */
export function buildCells(doc: FormDocument, values: Record<string, AnswerValue | null>, respondent: RespondentInfo | null = null): Record<string, string | number | boolean> {
  const cells: Record<string, string | number | boolean> = {};
  if (recordsRespondent(doc)) for (const column of RESPONDENT_COLUMNS) cells[column.key] = respondent ? column.pick(respondent) : "";
  for (const field of allFields(doc)) {
    if (!collectsAnswer(field)) continue;
    const value = values[field.id];
    const empty = value === null || value === undefined;
    if (isGridField(field)) {
      for (const row of field.rows) cells[gridColumnKey(field.id, row.id)] = empty ? "" : gridRowCell(field, value, row.id);
      continue;
    }
    cells[field.id] = empty ? "" : definitionFor(field).toCell(field, value);
  }
  return cells;
}

/** Column keys and headers for answer-collecting fields, in document order. */
export function fieldHeaders(doc: FormDocument): Array<{ fieldId: string; header: string }> {
  const respondent = recordsRespondent(doc) ? RESPONDENT_COLUMNS.map((column) => ({ fieldId: column.key, header: column.header })) : [];
  const questions = allFields(doc)
    .filter(collectsAnswer)
    .flatMap((field, index) => {
      const header = labelOf(field.label, index);
      if (!isGridField(field)) return [{ fieldId: field.id, header }];
      return field.rows.map((row, rowIndex) => ({ fieldId: gridColumnKey(field.id, row.id), header: `${header} [${gridRowLabel(field, rowIndex)}]` }));
    });
  return [...respondent, ...questions];
}

/** The JSONB `data` object for Supabase/Postgres rows: { fieldId: { label, value } }, plus "respondent.*" keys when recorded. */
export function buildRowData(answers: PayloadAnswer[], respondent: RespondentInfo | null = null): Record<string, { label: string; value: OutputValue | null }> {
  const data: Record<string, { label: string; value: OutputValue | null }> = {};
  if (respondent) for (const column of RESPONDENT_COLUMNS) data[column.key] = { label: column.header, value: column.pick(respondent) || null };
  for (const answer of answers) data[answer.fieldId] = { label: answer.label, value: answer.value };
  return data;
}
