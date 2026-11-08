import { collectsAnswer, definitionFor, type AnswerValue, type OutputValue } from "./fields";
import { gridRowCell, gridRowLabel } from "./fields/grid";
import { allFields, isGridField, type FieldType, type FormDocument } from "./schema";

// What destinations receive (spec §10). Built from the published document and
// validated values; never logged, never stored by us.

export type PayloadAnswer = { fieldId: string; label: string; type: FieldType; value: OutputValue | null };

export type ResponsePayload = {
  responseId: string;
  submittedAt: string;
  form: { id: string; title: string; slug: string };
  answers: PayloadAnswer[];
};

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
}): ResponsePayload {
  return {
    responseId: input.responseId,
    submittedAt: input.submittedAt.toISOString(),
    form: { id: input.form.id, title: input.doc.title, slug: input.form.slug },
    answers: buildAnswers(input.doc, input.values),
  };
}

// Spreadsheet columns are keyed by field id, except grids: one column per row,
// keyed "fieldId.rowId" and headed "Question [Row]" (as Google Forms does), so
// each row can be sorted and charted on its own.
export const gridColumnKey = (fieldId: string, rowId: string) => `${fieldId}.${rowId}`;

/** Spreadsheet cell text per column key (formulas never execute: values are written RAW). */
export function buildCells(doc: FormDocument, values: Record<string, AnswerValue | null>): Record<string, string | number | boolean> {
  const cells: Record<string, string | number | boolean> = {};
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
  return allFields(doc)
    .filter(collectsAnswer)
    .flatMap((field, index) => {
      const header = labelOf(field.label, index);
      if (!isGridField(field)) return [{ fieldId: field.id, header }];
      return field.rows.map((row, rowIndex) => ({ fieldId: gridColumnKey(field.id, row.id), header: `${header} [${gridRowLabel(field, rowIndex)}]` }));
    });
}

/** The JSONB `data` object for Supabase/Postgres rows: { fieldId: { label, value } }. */
export function buildRowData(answers: PayloadAnswer[]): Record<string, { label: string; value: OutputValue | null }> {
  return Object.fromEntries(answers.map((answer) => [answer.fieldId, { label: answer.label, value: answer.value }]));
}
