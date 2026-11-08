import { z } from "zod";

import { ID_PATTERN } from "./ids";

// The form document (ADR-006). Edited as `forms.draft`, snapshotted to
// `forms.published`. Isomorphic: no node imports.

export const LIMITS = {
  pages: 50,
  fields: 200,
  options: 200,
  gridRows: 50,
  gridColumns: 20,
  label: 500,
  description: 2000,
  shortText: 1000,
  longText: 10_000,
  title: 200,
  formDescription: 4000,
} as const;

export const PROGRAM_IDS = ["am", "gv", "gta", "gte", "ys", "h4tf"] as const;
export type ProgramAccent = (typeof PROGRAM_IDS)[number];

export const THEME_MODES = ["auto", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** The design system's four styles (calm is its default). */
export const FORM_STYLES = ["calm", "warm", "bold", "playful"] as const;
export type FormStyle = (typeof FORM_STYLES)[number];

export const FILE_KINDS = ["image", "video", "audio", "pdf", "document", "spreadsheet", "presentation", "archive"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "url",
  "date",
  "time",
  "single_choice",
  "multi_choice",
  "dropdown",
  "choice_grid",
  "checkbox_grid",
  "linear_scale",
  "rating",
  "file_upload",
  "consent",
  "statement",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const pageId = z.string().regex(ID_PATTERN.p);
const fieldId = z.string().regex(ID_PATTERN.f);
const optionId = z.string().regex(ID_PATTERN.o);

const length = (max: number) => z.number().int().min(0).max(max).nullable().default(null);
const placeholder = z.string().max(200).default("");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CONDITION_OPERATORS = ["is", "is_not", "contains", "answered", "not_answered"] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** Show a question or page only when an earlier answer matches (ADR-009). */
export const conditionSchema = z.object({
  fieldId,
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string().max(LIMITS.label).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

const base = {
  id: fieldId,
  label: z.string().max(LIMITS.label).default(""),
  description: z.string().max(LIMITS.description).default(""),
  required: z.boolean().default(false),
  visibleIf: conditionSchema.nullable().default(null),
};

export const optionSchema = z.object({ id: optionId, label: z.string().max(LIMITS.label) });
export type Option = z.infer<typeof optionSchema>;
const options = z.array(optionSchema).max(LIMITS.options).default([]);

const shortText = z.object({ ...base, type: z.literal("short_text"), placeholder, minLength: length(LIMITS.shortText), maxLength: length(LIMITS.shortText) });
const longText = z.object({ ...base, type: z.literal("long_text"), placeholder, minLength: length(LIMITS.longText), maxLength: length(LIMITS.longText) });
const email = z.object({ ...base, type: z.literal("email"), placeholder });
const phone = z.object({ ...base, type: z.literal("phone"), placeholder });
const number = z.object({
  ...base,
  type: z.literal("number"),
  placeholder,
  min: z.number().finite().nullable().default(null),
  max: z.number().finite().nullable().default(null),
  integer: z.boolean().default(false),
});
const url = z.object({ ...base, type: z.literal("url"), placeholder });
const date = z.object({ ...base, type: z.literal("date"), min: isoDate.nullable().default(null), max: isoDate.nullable().default(null) });
const time = z.object({ ...base, type: z.literal("time") });
const singleChoice = z.object({ ...base, type: z.literal("single_choice"), options, allowOther: z.boolean().default(false), shuffle: z.boolean().default(false) });
const multiChoice = z.object({
  ...base,
  type: z.literal("multi_choice"),
  options,
  allowOther: z.boolean().default(false),
  shuffle: z.boolean().default(false),
  minSelected: z.number().int().min(1).max(LIMITS.options).nullable().default(null),
  maxSelected: z.number().int().min(1).max(LIMITS.options).nullable().default(null),
});
const dropdown = z.object({ ...base, type: z.literal("dropdown"), options });
const gridRows = z.array(optionSchema).min(1).max(LIMITS.gridRows);
const gridColumns = z.array(optionSchema).min(1).max(LIMITS.gridColumns);
const choiceGrid = z.object({ ...base, type: z.literal("choice_grid"), rows: gridRows, columns: gridColumns });
const checkboxGrid = z.object({ ...base, type: z.literal("checkbox_grid"), rows: gridRows, columns: gridColumns });
const linearScale = z.object({
  ...base,
  type: z.literal("linear_scale"),
  min: z.union([z.literal(0), z.literal(1)]).default(1),
  max: z.number().int().min(2).max(10).default(5),
  minLabel: z.string().max(60).default(""),
  maxLabel: z.string().max(60).default(""),
});
const rating = z.object({ ...base, type: z.literal("rating"), max: z.number().int().min(3).max(10).default(5) });
const fileUpload = z.object({
  ...base,
  type: z.literal("file_upload"),
  maxFiles: z.number().int().min(1).max(10).default(1),
  maxSizeMb: z.number().int().min(1).max(100).default(10),
  /** Empty means any file type. */
  accept: z.array(z.enum(FILE_KINDS)).max(FILE_KINDS.length).default([]),
});
const consent = z.object({ ...base, type: z.literal("consent"), checkboxLabel: z.string().max(LIMITS.label).default("I agree") });
const statement = z.object({ ...base, type: z.literal("statement") });

export const fieldSchema = z.discriminatedUnion("type", [
  shortText,
  longText,
  email,
  phone,
  number,
  url,
  date,
  time,
  singleChoice,
  multiChoice,
  dropdown,
  choiceGrid,
  checkboxGrid,
  linearScale,
  rating,
  fileUpload,
  consent,
  statement,
]);

export type Field = z.infer<typeof fieldSchema>;
export type FieldOf<T extends FieldType> = Extract<Field, { type: T }>;
export type ChoiceField = FieldOf<"single_choice"> | FieldOf<"multi_choice"> | FieldOf<"dropdown">;
export type GridField = FieldOf<"choice_grid"> | FieldOf<"checkbox_grid">;

export const pageSchema = z.object({
  id: pageId,
  title: z.string().max(300).default(""),
  description: z.string().max(LIMITS.description).default(""),
  visibleIf: conditionSchema.nullable().default(null),
  fields: z.array(fieldSchema).max(LIMITS.fields).default([]),
});
export type Page = z.infer<typeof pageSchema>;

const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use a link that starts with https://");

/** Who can respond (ADR-013). Versioned with the form: applies when published. */
export const accessSchema = z.object({
  /** "anyone": the public link works for everyone. "aiesec": people sign in with AIESEC first. */
  mode: z.enum(["anyone", "aiesec"]).default("anyone"),
  /** Only people with a current EXPA position. */
  membersOnly: z.boolean().default(false),
  /** Add the respondent's name, email and AIESEC ID to each response. */
  recordRespondent: z.boolean().default(true),
  /** One response per AIESEC account. */
  onePerPerson: z.boolean().default(false),
});
export type FormAccess = z.infer<typeof accessSchema>;

export const settingsSchema = z.object({
  submitLabel: z.string().trim().min(1).max(40).default("Send response"),
  confirmationTitle: z.string().max(200).default("Thanks, we got your response"),
  confirmationMessage: z.string().max(2000).default(""),
  redirectUrl: httpsUrl.nullable().default(null),
  showProgressBar: z.boolean().default(true),
  allowAnotherResponse: z.boolean().default(false),
  access: accessSchema.default(accessSchema.parse({})),
});
export type FormSettings = z.infer<typeof settingsSchema>;

export const themeSchema = z.object({
  accent: z.enum(PROGRAM_IDS).default("am"),
  style: z.enum(FORM_STYLES).default("calm"),
  mode: z.enum(THEME_MODES).default("auto"),
});
export type FormTheme = z.infer<typeof themeSchema>;

export const formDocumentSchema = z
  .object({
    version: z.literal(1),
    title: z.string().max(LIMITS.title),
    description: z.string().max(LIMITS.formDescription).default(""),
    pages: z.array(pageSchema).min(1).max(LIMITS.pages),
    settings: settingsSchema.default(settingsSchema.parse({})),
    theme: themeSchema.default(themeSchema.parse({})),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    let fieldCount = 0;
    const claim = (id: string, path: (string | number)[]) => {
      if (seen.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate id ${id}`, path });
      seen.add(id);
    };
    doc.pages.forEach((page, pageIndex) => {
      claim(page.id, ["pages", pageIndex, "id"]);
      page.fields.forEach((field, fieldIndex) => {
        fieldCount += 1;
        claim(field.id, ["pages", pageIndex, "fields", fieldIndex, "id"]);
        if ("options" in field) {
          field.options.forEach((option, optionIndex) => claim(option.id, ["pages", pageIndex, "fields", fieldIndex, "options", optionIndex]));
        }
        if ("rows" in field) {
          [...field.rows, ...field.columns].forEach((item, itemIndex) => claim(item.id, ["pages", pageIndex, "fields", fieldIndex, "grid", itemIndex]));
        }
      });
    });
    if (fieldCount > LIMITS.fields) ctx.addIssue({ code: "custom", message: `A form can have up to ${LIMITS.fields} questions`, path: ["pages"] });
  });

export type FormDocument = z.infer<typeof formDocumentSchema>;

/** Parses untrusted JSON (DB column, client payload) into a document, or null. */
export function parseDocument(value: unknown): FormDocument | null {
  const parsed = formDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function allFields(doc: FormDocument): Field[] {
  return doc.pages.flatMap((page) => page.fields);
}

export function isChoiceField(field: Field): field is ChoiceField {
  return field.type === "single_choice" || field.type === "multi_choice" || field.type === "dropdown";
}

export function isGridField(field: Field): field is GridField {
  return field.type === "choice_grid" || field.type === "checkbox_grid";
}
