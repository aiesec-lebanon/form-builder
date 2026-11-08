import { collectsAnswer } from "./fields";
import { isChoiceField, type Condition, type ConditionOperator, type Field, type FormDocument, type Page } from "./schema";

// Conditional logic (ADR-009). One evaluator for the builder preview, the live
// form and the server. Conditions reference earlier questions only; if that
// question is hidden, everything depending on it is hidden too.

export type Visibility = { pages: Set<string>; fields: Set<string> };

const OPERATOR_LABEL: Record<ConditionOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  answered: "is answered",
  not_answered: "is not answered",
};

/** Operators that make sense for a source question. */
export function operatorsFor(field: Field): ConditionOperator[] {
  if (isChoiceField(field)) return ["is", "is_not", "answered", "not_answered"];
  switch (field.type) {
    case "short_text":
    case "long_text":
    case "email":
    case "url":
    case "phone":
      return ["is", "is_not", "contains", "answered", "not_answered"];
    case "number":
    case "linear_scale":
    case "rating":
    case "date":
    case "time":
      return ["is", "is_not", "answered", "not_answered"];
    default:
      return ["answered", "not_answered"];
  }
}

export function needsValue(operator: ConditionOperator): boolean {
  return operator === "is" || operator === "is_not" || operator === "contains";
}

function optionIdsOf(raw: unknown): string[] {
  if (typeof raw === "string") return raw ? [raw] : [];
  if (raw && typeof raw === "object" && Array.isArray((raw as { optionIds?: unknown }).optionIds)) return (raw as { optionIds: string[] }).optionIds;
  return [];
}

function isAnswered(field: Field, raw: unknown): boolean {
  if (raw === undefined || raw === null) return false;
  if (isChoiceField(field)) {
    const other = (raw as { other?: unknown })?.other;
    return optionIdsOf(raw).length > 0 || (typeof other === "string" && other.trim() !== "");
  }
  if (field.type === "consent") return raw === true;
  if (field.type === "choice_grid" || field.type === "checkbox_grid") {
    return typeof raw === "object" && Object.values(raw as Record<string, unknown>).some((selection) => (Array.isArray(selection) ? selection.length > 0 : Boolean(selection)));
  }
  if (field.type === "file_upload") return Array.isArray(raw) && raw.length > 0;
  if (field.type === "rating") return typeof raw === "number" && raw > 0;
  return String(raw).trim() !== "";
}

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function evaluateCondition(condition: Condition, source: Field, raw: unknown): boolean {
  const answered = isAnswered(source, raw);
  switch (condition.operator) {
    case "answered":
      return answered;
    case "not_answered":
      return !answered;
    case "contains":
      return answered && normalize(raw).includes(normalize(condition.value));
    case "is":
    case "is_not": {
      if (!answered) return false;
      const matches = isChoiceField(source) ? optionIdsOf(raw).includes(condition.value) : normalize(raw) === normalize(condition.value);
      return condition.operator === "is" ? matches : !matches;
    }
  }
}

/** Which pages and questions are visible for the given (raw) answers. */
export function computeVisibility(doc: FormDocument, answers: Record<string, unknown>): Visibility {
  const pages = new Set<string>();
  const fields = new Set<string>();
  const seen = new Map<string, Field>();
  const passes = (condition: Condition | null) => {
    if (!condition) return true;
    const source = seen.get(condition.fieldId);
    // Unknown, later or hidden source → hidden.
    if (!source || !fields.has(source.id)) return false;
    return evaluateCondition(condition, source, answers[source.id]);
  };
  for (const page of doc.pages) {
    const pageVisible = passes(page.visibleIf);
    if (pageVisible) pages.add(page.id);
    for (const field of page.fields) {
      if (pageVisible && passes(field.visibleIf)) fields.add(field.id);
      seen.set(field.id, field);
    }
  }
  return { pages, fields };
}

export function visibleFields(doc: FormDocument, answers: Record<string, unknown>): Field[] {
  const visibility = computeVisibility(doc, answers);
  return doc.pages.flatMap((page) => page.fields.filter((field) => visibility.fields.has(field.id)));
}

/** Questions a condition on `targetId` (a field or page) may reference: earlier, answer-collecting. */
export function conditionSources(doc: FormDocument, target: { fieldId?: string; pageId?: string }): Field[] {
  const sources: Field[] = [];
  for (const page of doc.pages) {
    if (target.pageId === page.id) return sources;
    for (const field of page.fields) {
      if (target.fieldId === field.id) return sources;
      if (collectsAnswer(field)) sources.push(field);
    }
  }
  return sources;
}

/** "Programme is Global Volunteer", for chips and summaries. */
export function describeCondition(doc: FormDocument, condition: Condition): string {
  const source = doc.pages.flatMap((page) => page.fields).find((field) => field.id === condition.fieldId);
  if (!source) return "Depends on a deleted question";
  const name = source.label.trim() || "an untitled question";
  if (!needsValue(condition.operator)) return `${name} ${OPERATOR_LABEL[condition.operator]}`;
  const value = isChoiceField(source) ? (source.options.find((option) => option.id === condition.value)?.label ?? "a deleted option") : condition.value;
  return `${name} ${OPERATOR_LABEL[condition.operator]} “${value}”`;
}

/** Problems with a condition, for publish checks. */
export function conditionProblem(doc: FormDocument, condition: Condition, target: { fieldId?: string; pageId?: string }): string | null {
  const sources = conditionSources(doc, target);
  const source = sources.find((field) => field.id === condition.fieldId);
  if (!source) return "depends on a question that was deleted or now comes after it";
  if (!operatorsFor(source).includes(condition.operator)) return "has a rule that doesn't fit its source question";
  if (needsValue(condition.operator) && !condition.value.trim()) return "has a rule with no value";
  if (isChoiceField(source) && needsValue(condition.operator) && !source.options.some((option) => option.id === condition.value)) return "depends on an option that was removed";
  return null;
}

export type { Page };
