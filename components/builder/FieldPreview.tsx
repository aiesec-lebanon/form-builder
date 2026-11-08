import { Calendar, ChevronDown, Clock, FileUp, Star } from "lucide-react";

import { cx } from "@/components/aiesec";
import { OTHER_LABEL } from "@/lib/forms/fields/choice";
import type { Field } from "@/lib/forms/schema";

// A quiet, non-interactive picture of how the question will look.

const box = "flex h-10 w-full max-w-md items-center gap-2 rounded-md border border-border-strong px-3 ae-body-sm text-text-muted";

export function FieldPreview({ field }: { field: Field }) {
  switch (field.type) {
    case "short_text":
    case "email":
    case "phone":
    case "number":
    case "url":
      return <div className={box}>{field.placeholder || "Short answer"}</div>;
    case "long_text":
      return <div className={cx(box, "h-20 items-start pt-2")}>{field.placeholder || "Long answer"}</div>;
    case "date":
      return (
        <div className={cx(box, "max-w-48")}>
          <Calendar size={16} aria-hidden="true" /> Date
        </div>
      );
    case "time":
      return (
        <div className={cx(box, "max-w-48")}>
          <Clock size={16} aria-hidden="true" /> Time
        </div>
      );
    case "dropdown":
      return (
        <div className={cx(box, "justify-between")}>
          <span>Choose</span>
          <ChevronDown size={16} aria-hidden="true" />
        </div>
      );
    case "single_choice":
    case "multi_choice": {
      const shown = field.options.slice(0, 5);
      const rest = field.options.length - shown.length;
      return (
        <ul role="list" className="flex flex-col gap-2">
          {shown.map((option, index) => (
            <li key={option.id} className="flex items-center gap-3 ae-body-sm text-text">
              <span aria-hidden="true" className={cx("inline-block size-4 shrink-0 border-2 border-border-strong", field.type === "single_choice" ? "rounded-full" : "rounded-sm")} />
              {option.label || <span className="text-text-muted">Option {index + 1}</span>}
            </li>
          ))}
          {field.allowOther && (
            <li className="flex items-center gap-3 ae-body-sm text-text-muted">
              <span aria-hidden="true" className={cx("inline-block size-4 shrink-0 border-2 border-border-strong", field.type === "single_choice" ? "rounded-full" : "rounded-sm")} />
              {OTHER_LABEL}…
            </li>
          )}
          {rest > 0 && <li className="ae-caption text-text-muted">and {rest} more</li>}
        </ul>
      );
    }
    case "choice_grid":
    case "checkbox_grid": {
      const rows = field.rows.slice(0, 4);
      const columns = field.columns.slice(0, 6);
      const more = field.rows.length - rows.length;
      return (
        <div className="max-w-full overflow-x-auto">
          <table className="border-separate border-spacing-x-3 border-spacing-y-1.5 ae-body-sm">
            <thead>
              <tr>
                <td />
                {columns.map((column, index) => (
                  <th key={column.id} scope="col" className="px-1 text-center font-normal text-text-muted">
                    {column.label || `Column ${index + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <th scope="row" className="pr-2 text-left font-normal text-text">
                    {row.label || `Row ${index + 1}`}
                  </th>
                  {columns.map((column) => (
                    <td key={column.id} className="text-center">
                      <span aria-hidden="true" className={cx("inline-block size-4 border-2 border-border-strong align-middle", field.type === "choice_grid" ? "rounded-full" : "rounded-sm")} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {more > 0 && <p className="ae-caption text-text-muted">and {more} more rows</p>}
        </div>
      );
    }
    case "linear_scale": {
      const steps = Array.from({ length: field.max - field.min + 1 }, (_, index) => field.min + index);
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {steps.map((step) => (
              <span key={step} className="inline-flex size-9 items-center justify-center rounded-md border border-border-strong ae-body-sm text-text">
                {step}
              </span>
            ))}
          </div>
          {(field.minLabel || field.maxLabel) && (
            <div className="flex max-w-md justify-between ae-caption text-text-muted">
              <span>{field.minLabel}</span>
              <span>{field.maxLabel}</span>
            </div>
          )}
        </div>
      );
    }
    case "rating":
      return (
        <div className="flex gap-1 text-border-strong" aria-hidden="true">
          {Array.from({ length: field.max }, (_, index) => (
            <Star key={index} size={24} />
          ))}
        </div>
      );
    case "file_upload":
      return (
        <div className="flex max-w-md items-center gap-3 rounded-md border-2 border-dashed border-border-strong px-4 py-3 ae-body-sm text-text-muted">
          <FileUp size={20} aria-hidden="true" />
          {field.maxFiles === 1 ? "Upload a file" : `Upload up to ${field.maxFiles} files`} · up to {field.maxSizeMb} MB
        </div>
      );
    case "consent":
      return (
        <div className="flex items-start gap-3 ae-body-sm text-text">
          <span aria-hidden="true" className="mt-0.5 inline-block size-4 shrink-0 rounded-sm border-2 border-border-strong" />
          {field.checkboxLabel || "I agree"}
        </div>
      );
    case "statement":
      return null;
  }
}
