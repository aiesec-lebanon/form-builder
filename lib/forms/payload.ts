import { collectsAnswer, definitionFor, type AnswerValue, type OutputValue } from "./fields";
import { allFields, type FieldType, type FormDocument } from "./schema";

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

/** Spreadsheet cell text per field id (formulas never execute: values are written RAW). */
export function buildCells(doc: FormDocument, values: Record<string, AnswerValue | null>): Record<string, string | number | boolean> {
  const cells: Record<string, string | number | boolean> = {};
  for (const field of allFields(doc)) {
    if (!collectsAnswer(field)) continue;
    const value = values[field.id];
    cells[field.id] = value === null || value === undefined ? "" : definitionFor(field).toCell(field, value);
  }
  return cells;
}

/** Column headers for answer-collecting fields, in document order. */
export function fieldHeaders(doc: FormDocument): Array<{ fieldId: string; header: string }> {
  return allFields(doc)
    .filter(collectsAnswer)
    .map((field, index) => ({ fieldId: field.id, header: labelOf(field.label, index) }));
}

/** The JSONB `data` object for Supabase/Postgres rows: { fieldId: { label, value } }. */
export function buildRowData(answers: PayloadAnswer[]): Record<string, { label: string; value: OutputValue | null }> {
  return Object.fromEntries(answers.map((answer) => [answer.fieldId, { label: answer.label, value: answer.value }]));
}
