import { newId } from "../ids";
import { type Field, type FieldOf, type FieldType } from "../schema";
import { dropdown, multiChoice, singleChoice } from "./choice";
import { consent, date, fileUpload, linearScale, rating, statement, time } from "./other";
import { email, longText, number, phone, shortText, url } from "./text";
import type { AnswerValue, FieldDefinition, FieldGroup, ValidationResult } from "./types";

export type { AnswerValue, ChoiceValue, FieldDefinition, FieldGroup, FileAnswer, OutputValue, ResolvedFile, ValidationResult } from "./types";

type Registry = { [T in FieldType]: FieldDefinition<FieldOf<T>> };

export const FIELD_DEFINITIONS: Registry = {
  short_text: shortText,
  long_text: longText,
  email,
  phone,
  number,
  url,
  date,
  time,
  single_choice: singleChoice,
  multi_choice: multiChoice,
  dropdown,
  linear_scale: linearScale,
  rating,
  file_upload: fileUpload,
  consent,
  statement,
};

/** The definition for a field, typed to that field. */
export function definitionFor<F extends Field>(field: F): FieldDefinition<F> {
  return FIELD_DEFINITIONS[field.type] as unknown as FieldDefinition<F>;
}

export function definitionOf<T extends FieldType>(type: T): FieldDefinition<FieldOf<T>> {
  return FIELD_DEFINITIONS[type];
}

export const PALETTE: Array<{ group: FieldGroup; title: string; types: FieldType[] }> = [
  { group: "text", title: "Text", types: ["short_text", "long_text", "email", "phone", "number", "url"] },
  { group: "choice", title: "Choice", types: ["single_choice", "multi_choice", "dropdown"] },
  { group: "scale", title: "Scale", types: ["linear_scale", "rating"] },
  { group: "datetime", title: "Date and time", types: ["date", "time"] },
  { group: "other", title: "More", types: ["file_upload", "consent", "statement"] },
];

export function createField<T extends FieldType>(type: T): FieldOf<T> {
  return definitionOf(type).create(newId("f"));
}

const TEXT_TYPES: FieldType[] = ["short_text", "long_text", "email", "phone", "number", "url"];
const CHOICE_TYPES: FieldType[] = ["single_choice", "multi_choice", "dropdown"];
const SCALE_TYPES: FieldType[] = ["linear_scale", "rating"];

/** Types a field can switch to while keeping its meaning (and most settings). */
export function compatibleTypes(type: FieldType): FieldType[] {
  for (const family of [TEXT_TYPES, CHOICE_TYPES, SCALE_TYPES]) {
    if (family.includes(type)) return family;
  }
  return [type];
}

/** Switches a field's type, keeping id, label, description, required, placeholder and options. */
export function convertField(field: Field, type: FieldType): Field {
  if (field.type === type) return field;
  const next = definitionOf(type).create(field.id) as Field;
  const merged: Record<string, unknown> = { ...next, label: field.label, description: field.description, required: field.required, visibleIf: field.visibleIf };
  if ("placeholder" in field && "placeholder" in next) {
    // Keep a custom placeholder, but not another type's default example.
    const previousDefault = (definitionOf(field.type).create(field.id) as { placeholder?: string }).placeholder;
    if (field.placeholder && field.placeholder !== previousDefault) merged.placeholder = field.placeholder;
  }
  if ("options" in field && "options" in next) merged.options = field.options;
  if ("allowOther" in field && "allowOther" in next) merged.allowOther = field.allowOther;
  return merged as Field;
}

export function collectsAnswer(field: Field): boolean {
  return definitionFor(field).collectsAnswer;
}

/** Validates one answer, including the required rule. */
export function validateField(field: Field, raw: unknown): ValidationResult {
  const definition = definitionFor(field);
  if (!definition.collectsAnswer) return { ok: true, value: null };
  const result = definition.validate(field, raw);
  if (!result.ok) return result;
  if (result.value === null && field.required) return { ok: false, error: definition.requiredMessage(field) };
  return result;
}

export type AnswersValidation =
  | { ok: true; values: Record<string, AnswerValue | null> }
  | { ok: false; errors: Record<string, string>; values: Record<string, AnswerValue | null> };

/** Validates answers for the given fields. Unknown keys in `answers` are ignored. */
export function validateAnswers(fields: Field[], answers: Record<string, unknown>): AnswersValidation {
  const values: Record<string, AnswerValue | null> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (!collectsAnswer(field)) continue;
    const result = validateField(field, Object.prototype.hasOwnProperty.call(answers, field.id) ? answers[field.id] : undefined);
    if (result.ok) values[field.id] = result.value;
    else errors[field.id] = result.error;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors, values } : { ok: true, values };
}
