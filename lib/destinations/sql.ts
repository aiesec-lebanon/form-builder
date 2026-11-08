// Setup SQL shown to owners (isomorphic: rendered in the Connect tab).

import { collectsAnswer } from "@/lib/forms/fields";
import { gridRowLabel } from "@/lib/forms/fields/grid";
import { recordsRespondent, RESPONDENT_COLUMNS } from "@/lib/forms/payload";
import { allFields, isGridField, type FormDocument } from "@/lib/forms/schema";

export const SUPABASE_TABLE_SQL = `create table if not exists public.form_responses (
  response_id uuid primary key,
  form_id text not null,
  submitted_at timestamptz not null,
  data jsonb not null
);
-- Keep responses private: RLS on, no public policies.
-- Use your project's secret key in AIESEC Forms; it bypasses RLS.
alter table public.form_responses enable row level security;`;

export const POSTGRES_TABLE_SQL = `create table if not exists public.form_responses (
  response_id uuid primary key,
  form_id text not null,
  submitted_at timestamptz not null,
  data jsonb not null
);`;

// --- One column per question, as a view over the `data` column (ADR-014) ----

const RESERVED = new Set(["response_id", "form_id", "submitted_at", "data"]);
const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** "Which committee are you in?" → which_committee_are_you_in (Postgres-safe, ≤ 59 chars). */
export function columnName(label: string, fallback: string): string {
  const base = label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 59)
    .replace(/_+$/g, "");
  if (!base) return fallback;
  return /^[0-9]/.test(base) ? `q_${base}`.slice(0, 59) : base;
}

type ViewColumn = { name: string; expression: string };

function viewColumns(doc: FormDocument): ViewColumn[] {
  const used = new Set(RESERVED);
  const unique = (name: string) => {
    let candidate = name;
    for (let index = 2; used.has(candidate); index += 1) candidate = `${name.slice(0, 55)}_${index}`;
    used.add(candidate);
    return candidate;
  };
  const answer = (key: string) => `data->${literal(key)}->'value'`;
  const columns: ViewColumn[] = [];
  if (recordsRespondent(doc)) {
    for (const column of RESPONDENT_COLUMNS) columns.push({ name: unique(columnName(column.header, "respondent")), expression: `${answer(column.key)}#>>'{}'` });
  }
  allFields(doc)
    .filter(collectsAnswer)
    .forEach((field, index) => {
      const name = columnName(field.label, `question_${index + 1}`);
      if (isGridField(field)) {
        field.rows.forEach((_, rowIndex) => {
          const row = gridRowLabel(field, rowIndex);
          const value = `${answer(field.id)}->${literal(row)}`;
          columns.push({ name: unique(columnName(`${name} ${row}`, `${name}_row_${rowIndex + 1}`)), expression: field.type === "checkbox_grid" ? value : `${value}#>>'{}'` });
        });
        return;
      }
      const raw = answer(field.id);
      const expression =
        field.type === "number" || field.type === "linear_scale" || field.type === "rating"
          ? `(${raw}#>>'{}')::numeric`
          : field.type === "consent"
            ? `(${raw}#>>'{}')::boolean`
            : field.type === "multi_choice" || field.type === "file_upload"
              ? raw
              : `${raw}#>>'{}'`;
      columns.push({ name: unique(name), expression });
    });
  return columns;
}

/**
 * SQL for a view with one column per question, reading the `data` column we
 * write. Owners run it in their database; nothing changes how responses are
 * stored. Lists (checkboxes, files, checkbox grids) stay as jsonb.
 */
export function columnsViewSql(input: { doc: FormDocument; formId: string; schema: string; table: string }): string {
  const viewName = `${columnName(input.doc.title, "form").slice(0, 50)}_responses`;
  const view = `${quote(input.schema)}.${quote(viewName)}`;
  const select = [
    "  response_id",
    "  submitted_at",
    ...viewColumns(input.doc).map((column) => `  ${column.expression} as ${quote(column.name)}`),
  ].join(",\n");
  return `-- One column per question for "${input.doc.title.replace(/\n/g, " ") || "Untitled form"}".
-- Run it again after you change the questions; old answers stay in the table.
drop view if exists ${view};
create view ${view} as
select
${select}
from ${quote(input.schema)}.${quote(input.table)}
where form_id = ${literal(input.formId)};`;
}
