import { z } from "zod";

import { newId } from "../ids";
import { LIMITS, type ChoiceField, type FieldOf } from "../schema";
import { invalid, ok, type AnswerValue, type ChoiceValue, type FieldDefinition, type ValidationResult } from "./types";

// Choice questions. All three share one answer shape: { optionIds, other }.

const rawChoice = z.object({
  optionIds: z.array(z.string().max(32)).max(LIMITS.options).default([]),
  other: z.string().max(LIMITS.shortText).nullable().optional(),
});

export const OTHER_LABEL = "Other";

function parseChoice(field: ChoiceField, raw: unknown): ChoiceValue | ValidationResult | null {
  if (raw === undefined || raw === null) return null;
  const parsed = rawChoice.safeParse(raw);
  if (!parsed.success) return invalid("Choose from the options listed.");
  const known = new Set(field.options.map((option) => option.id));
  const optionIds = [...new Set(parsed.data.optionIds)];
  if (optionIds.some((id) => !known.has(id))) return invalid("Choose from the options listed.");
  const allowOther = field.type !== "dropdown" && field.allowOther;
  const otherChosen = parsed.data.other !== null && parsed.data.other !== undefined;
  if (otherChosen && !allowOther) return invalid("Choose from the options listed.");
  const other = otherChosen ? (parsed.data.other as string).trim() : null;
  if (otherChosen && !other) return invalid("Describe your other answer.");
  if (optionIds.length === 0 && other === null) return null;
  return { optionIds, other };
}

const isResult = (value: unknown): value is ValidationResult => typeof value === "object" && value !== null && "ok" in value;

function labelsOf(field: ChoiceField, value: AnswerValue): string[] {
  const choice = value as ChoiceValue;
  const byId = new Map(field.options.map((option, index) => [option.id, option.label.trim() || `Option ${index + 1}`]));
  const labels = choice.optionIds.map((id) => byId.get(id) ?? id);
  if (choice.other) labels.push(choice.other);
  return labels;
}

function defaultOptions() {
  return [{ id: newId("o"), label: "Option 1" }];
}

export const singleChoice: FieldDefinition<FieldOf<"single_choice">> = {
  type: "single_choice",
  name: "Multiple choice",
  hint: "Pick one, all options visible",
  group: "choice",
  collectsAnswer: true,
  create: (id) => ({ id, type: "single_choice", label: "", description: "", required: false, visibleIf: null, options: defaultOptions(), allowOther: false, shuffle: false }),
  validate: (field, raw) => {
    const choice = parseChoice(field, raw);
    if (choice === null) return ok(null);
    if (isResult(choice)) return choice;
    if (choice.optionIds.length + (choice.other !== null ? 1 : 0) > 1) return invalid("Choose one option.");
    return ok(choice);
  },
  requiredMessage: () => "Choose an option.",
  toOutput: (field, value) => labelsOf(field, value)[0] ?? "",
  toCell: (field, value) => labelsOf(field, value)[0] ?? "",
};

export const multiChoice: FieldDefinition<FieldOf<"multi_choice">> = {
  type: "multi_choice",
  name: "Checkboxes",
  hint: "Pick as many as apply",
  group: "choice",
  collectsAnswer: true,
  create: (id) => ({
    id,
    type: "multi_choice",
    label: "",
    description: "",
    required: false,
    visibleIf: null,
    options: defaultOptions(),
    allowOther: false,
    shuffle: false,
    minSelected: null,
    maxSelected: null,
  }),
  validate: (field, raw) => {
    const choice = parseChoice(field, raw);
    if (choice === null) return ok(null);
    if (isResult(choice)) return choice;
    const count = choice.optionIds.length + (choice.other !== null ? 1 : 0);
    if (field.minSelected !== null && count < field.minSelected) return invalid(`Choose at least ${field.minSelected} options.`);
    if (field.maxSelected !== null && count > field.maxSelected) return invalid(`Choose up to ${field.maxSelected} option${field.maxSelected === 1 ? "" : "s"}.`);
    return ok(choice);
  },
  requiredMessage: (field) => (field.minSelected && field.minSelected > 1 ? `Choose at least ${field.minSelected} options.` : "Choose at least one option."),
  toOutput: (field, value) => labelsOf(field, value),
  toCell: (field, value) => labelsOf(field, value).join(", "),
};

export const dropdown: FieldDefinition<FieldOf<"dropdown">> = {
  type: "dropdown",
  name: "Dropdown",
  hint: "Pick one from a long list",
  group: "choice",
  collectsAnswer: true,
  create: (id) => ({ id, type: "dropdown", label: "", description: "", required: false, visibleIf: null, options: defaultOptions() }),
  validate: (field, raw) => {
    const choice = parseChoice(field, typeof raw === "string" ? { optionIds: raw ? [raw] : [] } : raw);
    if (choice === null) return ok(null);
    if (isResult(choice)) return choice;
    if (choice.optionIds.length > 1) return invalid("Choose one option.");
    return ok(choice);
  },
  requiredMessage: () => "Choose an option.",
  toOutput: (field, value) => labelsOf(field, value)[0] ?? "",
  toCell: (field, value) => labelsOf(field, value)[0] ?? "",
};
