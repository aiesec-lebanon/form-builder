import { z } from "zod";

import { newId } from "../ids";
import { type FieldOf, type GridField } from "../schema";
import { invalid, ok, type AnswerValue, type FieldDefinition, type GridValue, type ValidationResult } from "./types";

// Grids: the same columns for several rows ("Rate each session: Poor … Great").
// Answers are { rowId: columnId[] } for both kinds; one-per-row is enforced
// for the multiple-choice grid.

const rawGrid = z.record(z.string().max(32), z.union([z.string().max(32), z.array(z.string().max(32)).max(20)]));

function parseGrid(field: GridField, raw: unknown): GridValue | ValidationResult | null {
  if (raw === undefined || raw === null) return null;
  const parsed = rawGrid.safeParse(raw);
  if (!parsed.success) return invalid("Choose from the options listed.");
  const rows = new Set(field.rows.map((row) => row.id));
  const columns = new Set(field.columns.map((column) => column.id));
  const value: GridValue = {};
  for (const [rowId, selection] of Object.entries(parsed.data)) {
    if (!rows.has(rowId)) return invalid("Choose from the options listed.");
    const picked = [...new Set(Array.isArray(selection) ? selection : selection ? [selection] : [])];
    if (picked.some((columnId) => !columns.has(columnId))) return invalid("Choose from the options listed.");
    if (field.type === "choice_grid" && picked.length > 1) return invalid("Choose one answer in each row.");
    if (picked.length > 0) value[rowId] = picked;
  }
  return Object.keys(value).length === 0 ? null : value;
}

// Grid answers are keyed by row ids ("o_…"), so an "ok" key can only mean a ValidationResult.
const isResult = (value: unknown): value is ValidationResult => typeof value === "object" && value !== null && "ok" in value;

export const gridRowLabel = (field: GridField, rowIndex: number) => field.rows[rowIndex].label.trim() || `Row ${rowIndex + 1}`;

function columnLabels(field: GridField): Map<string, string> {
  return new Map(field.columns.map((column, index) => [column.id, column.label.trim() || `Column ${index + 1}`]));
}

function labelled(field: GridField, value: AnswerValue): Record<string, string[]> {
  const grid = value as GridValue;
  const columnLabel = columnLabels(field);
  const out: Record<string, string[]> = {};
  field.rows.forEach((row, index) => {
    const picked = grid[row.id];
    if (picked?.length) out[gridRowLabel(field, index)] = picked.map((id) => columnLabel.get(id) ?? id);
  });
  return out;
}

/** The spreadsheet cell for one row: "Good", or "Mon, Wed" for a checkbox grid. */
export function gridRowCell(field: GridField, value: AnswerValue, rowId: string): string {
  const columnLabel = columnLabels(field);
  return ((value as GridValue)[rowId] ?? []).map((id) => columnLabel.get(id) ?? id).join(", ");
}

function validateGrid(field: GridField, raw: unknown): ValidationResult {
  const grid = parseGrid(field, raw);
  if (grid === null) return ok(null);
  if (isResult(grid)) return grid;
  // A required grid needs an answer in every row.
  if (field.required && field.rows.some((row) => !grid[row.id]?.length)) return invalid("Answer every row.");
  return ok(grid);
}

function defaults(prefix: string, labels: string[]) {
  return labels.map((label) => ({ id: newId("o"), label: `${prefix}${label}` }));
}

export const choiceGrid: FieldDefinition<FieldOf<"choice_grid">> = {
  type: "choice_grid",
  name: "Multiple-choice grid",
  hint: "One answer per row, same scale",
  group: "choice",
  collectsAnswer: true,
  create: (id) => ({
    id,
    type: "choice_grid",
    label: "",
    description: "",
    required: false,
    visibleIf: null,
    rows: defaults("Row ", ["1", "2"]),
    columns: defaults("", ["Poor", "Okay", "Good", "Great"]),
  }),
  validate: validateGrid,
  requiredMessage: () => "Answer every row.",
  toOutput: (field, value) => Object.fromEntries(Object.entries(labelled(field, value)).map(([row, columns]) => [row, columns[0] ?? ""])),
  toCell: (field, value) =>
    Object.entries(labelled(field, value))
      .map(([row, columns]) => `${row}: ${columns[0] ?? ""}`)
      .join("; "),
};

export const checkboxGrid: FieldDefinition<FieldOf<"checkbox_grid">> = {
  type: "checkbox_grid",
  name: "Checkbox grid",
  hint: "Several answers per row",
  group: "choice",
  collectsAnswer: true,
  create: (id) => ({
    id,
    type: "checkbox_grid",
    label: "",
    description: "",
    required: false,
    visibleIf: null,
    rows: defaults("Row ", ["1", "2"]),
    columns: defaults("Column ", ["1", "2", "3"]),
  }),
  validate: validateGrid,
  requiredMessage: () => "Choose at least one answer in every row.",
  toOutput: (field, value) => labelled(field, value),
  toCell: (field, value) =>
    Object.entries(labelled(field, value))
      .map(([row, columns]) => `${row}: ${columns.join(", ")}`)
      .join("; "),
};
