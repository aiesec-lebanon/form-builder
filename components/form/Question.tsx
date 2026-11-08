"use client";

import { CircleAlert, Star } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";
import type { ChoiceValue, GridValue } from "@/lib/forms/fields";
import { OTHER_LABEL } from "@/lib/forms/fields/choice";
import type { ChoiceField, Field, FieldOf, GridField, Option } from "@/lib/forms/schema";

import { FileField, type UploadContext } from "./FileField";
import { linkify } from "./linkify";

// One question as respondents see it. Built on design-system classes, sized
// for touch (48 px controls), optional questions marked "(optional)".

type Props = {
  field: Field;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  optionOrder?: string[];
  upload: UploadContext;
};

const emptyChoice: ChoiceValue = { optionIds: [], other: null };

function asChoice(value: unknown): ChoiceValue {
  if (value && typeof value === "object" && "optionIds" in value) return value as ChoiceValue;
  return emptyChoice;
}

function orderedOptions(field: ChoiceField, order?: string[]): Option[] {
  if (!order) return field.options;
  const byId = new Map(field.options.map((option) => [option.id, option]));
  const ordered = order.map((id) => byId.get(id)).filter((option): option is Option => Boolean(option));
  return ordered.length === field.options.length ? ordered : field.options;
}

function Title({ field, as: As = "label", htmlFor }: { field: Field; as?: "label" | "legend" | "p"; htmlFor?: string }) {
  const optional = !field.required && field.type !== "statement";
  return (
    <As {...(As === "label" ? { htmlFor } : {})} className={cx("ae-body-lg font-bold text-text", As === "legend" && "float-left w-full p-0")}>
      {field.label || "Untitled question"}
      {optional && <span className="font-normal text-text-muted"> (optional)</span>}
    </As>
  );
}

function Description({ field, id }: { field: Field; id: string }) {
  if (!field.description) return null;
  return (
    <p id={id} className="whitespace-pre-line ae-body-sm text-text-muted">
      {linkify(field.description)}
    </p>
  );
}

function ErrorLine({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="ae-field__error ae-body-sm">
      <CircleAlert size={16} aria-hidden="true" />
      <span>
        <span className="sr-only">Error: </span>
        {error}
      </span>
    </p>
  );
}

const choiceRow = (checked: boolean, compact = false) =>
  cx(
    "flex min-h-12 cursor-pointer items-center rounded-md border transition-colors duration-150",
    compact ? "gap-2.5 px-3 py-2" : "gap-3 px-4 py-3",
    checked ? "border-primary bg-primary-soft" : "border-border bg-surface hover:border-border-strong",
    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
  );

function ChoiceControl({ field, value, onChange, describedBy, error, optionOrder }: { field: FieldOf<"single_choice"> | FieldOf<"multi_choice">; value: unknown; onChange: (value: unknown) => void; describedBy?: string; error?: string; optionOrder?: string[] }) {
  const choice = asChoice(value);
  const multiple = field.type === "multi_choice";
  const name = `q-${field.id}`;
  const otherRef = React.useRef<HTMLInputElement>(null);
  const otherChosen = choice.other !== null;

  const toggle = (optionId: string, checked: boolean) => {
    if (!multiple) return onChange({ optionIds: [optionId], other: null });
    const ids = checked ? [...choice.optionIds, optionId] : choice.optionIds.filter((id) => id !== optionId);
    onChange({ optionIds: ids, other: choice.other });
  };

  const setOther = (checked: boolean) => {
    if (!multiple) onChange(checked ? { optionIds: [], other: choice.other ?? "" } : emptyChoice);
    else onChange({ optionIds: choice.optionIds, other: checked ? (choice.other ?? "") : null });
    if (checked) requestAnimationFrame(() => otherRef.current?.focus());
  };

  return (
    <div className="flex flex-col gap-2">
      {orderedOptions(field, optionOrder).map((option) => {
        const checked = choice.optionIds.includes(option.id);
        return (
          <label key={option.id} className={choiceRow(checked)}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={option.id}
              checked={checked}
              onChange={(event) => toggle(option.id, event.target.checked)}
              aria-describedby={describedBy}
              aria-invalid={error ? true : undefined}
              className={multiple ? "ae-checkbox" : "ae-radio"}
            />
            <span className="ae-body text-text">{option.label}</span>
          </label>
        );
      })}
      {field.allowOther && (
        <div className={cx(choiceRow(otherChosen), "flex-wrap")}>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value="__other__"
              checked={otherChosen}
              onChange={(event) => setOther(event.target.checked)}
              aria-describedby={describedBy}
              className={multiple ? "ae-checkbox" : "ae-radio"}
            />
            <span className="ae-body text-text">{OTHER_LABEL}</span>
          </label>
          {otherChosen && (
            <input
              ref={otherRef}
              type="text"
              aria-label={`${OTHER_LABEL}: your answer`}
              value={choice.other ?? ""}
              maxLength={1000}
              onChange={(event) => onChange({ optionIds: multiple ? choice.optionIds : [], other: event.target.value })}
              className="h-10 min-w-0 flex-1 basis-48 border-0 border-b-2 border-border-strong bg-transparent px-1 ae-body text-text outline-none focus:border-primary"
              placeholder="Your answer"
            />
          )}
        </div>
      )}
    </div>
  );
}

function asGrid(value: unknown): GridValue {
  if (value && typeof value === "object" && !Array.isArray(value) && !("optionIds" in value)) return value as GridValue;
  return {};
}

const nameOf = (option: Option, index: number, fallback: string) => option.label.trim() || `${fallback} ${index + 1}`;

// A grid is a table from the sm breakpoint up and one compact group per row on
// phones. Both are rendered and one is hidden with CSS (display: none keeps the
// hidden copy out of the tab order and the accessibility tree); their inputs use
// different names so the browser never groups radios across the two.
function GridControl({ field, value, onChange, error, baseId }: { field: GridField; value: unknown; onChange: (value: unknown) => void; error?: string; baseId: string }) {
  const grid = asGrid(value);
  const multiple = field.type === "checkbox_grid";
  const inputType = multiple ? "checkbox" : "radio";
  const inputClass = multiple ? "ae-checkbox" : "ae-radio";

  const set = (rowId: string, columnId: string, checked: boolean) => {
    const current = grid[rowId] ?? [];
    const row = multiple ? (checked ? [...current.filter((id) => id !== columnId), columnId] : current.filter((id) => id !== columnId)) : [columnId];
    const next: GridValue = { ...grid };
    if (row.length > 0) next[rowId] = row;
    else delete next[rowId];
    onChange(next);
  };
  // After a failed submit, point at the rows that still need an answer.
  const missing = (rowId: string) => Boolean(error) && field.required && !(grid[rowId]?.length);

  return (
    <>
      <div className="hidden max-w-full overflow-x-auto sm:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <td className="min-w-32" />
              {field.columns.map((column, index) => (
                <th key={column.id} scope="col" className="px-1 pb-2 text-center align-bottom ae-body-sm font-normal text-text-muted">
                  {nameOf(column, index, "Column")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {field.rows.map((row, rowIndex) => {
              const picked = grid[row.id] ?? [];
              const rowName = nameOf(row, rowIndex, "Row");
              return (
                <tr key={row.id} className="border-t border-border">
                  <th scope="row" className={cx("py-2 pr-4 text-left ae-body font-normal", missing(row.id) ? "text-danger-text" : "text-text")}>
                    {rowName}
                    {missing(row.id) && <span className="sr-only"> (needs an answer)</span>}
                  </th>
                  {field.columns.map((column, columnIndex) => (
                    <td key={column.id} className="p-0 text-center">
                      <label className="inline-flex size-12 cursor-pointer items-center justify-center rounded-md hover:bg-bg-subtle">
                        <input
                          type={inputType}
                          name={`${baseId}-t-${row.id}`}
                          value={column.id}
                          checked={picked.includes(column.id)}
                          onChange={(event) => set(row.id, column.id, event.target.checked)}
                          aria-label={`${rowName}: ${nameOf(column, columnIndex, "Column")}`}
                          className={inputClass}
                        />
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-5 sm:hidden">
        {field.rows.map((row, rowIndex) => {
          const picked = grid[row.id] ?? [];
          return (
            <fieldset key={row.id} className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className={cx("float-left w-full p-0 ae-body", missing(row.id) ? "text-danger-text" : "text-text")}>
                {nameOf(row, rowIndex, "Row")}
                {missing(row.id) && <span className="sr-only"> (needs an answer)</span>}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {field.columns.map((column, columnIndex) => {
                  const checked = picked.includes(column.id);
                  return (
                    <label key={column.id} className={choiceRow(checked, true)}>
                      <input
                        type={inputType}
                        name={`${baseId}-m-${row.id}`}
                        value={column.id}
                        checked={checked}
                        onChange={(event) => set(row.id, column.id, event.target.checked)}
                        className={inputClass}
                      />
                      <span className="ae-body text-text">{nameOf(column, columnIndex, "Column")}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </>
  );
}

export function Question({ field, value, error, onChange, onBlur, optionOrder, upload }: Props) {
  const id = `q-${field.id}`;
  const inputId = `${id}-input`;
  const descId = `${id}-desc`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, field.description ? descId : null].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : undefined;
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);

  if (field.type === "statement") {
    return (
      <section id={id} className="flex flex-col gap-2">
        {field.label && <h2 className="ae-h4 text-text">{field.label}</h2>}
        {field.description && <p className="whitespace-pre-line ae-body text-text-muted">{linkify(field.description)}</p>}
      </section>
    );
  }

  const textInput = (type: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={cx("ae-input ae-input--lg max-w-xl", type === "date" && "ae-input--date")} data-invalid={invalid ? "true" : undefined}>
      <input
        id={inputId}
        type={type}
        value={text}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-required={field.required || undefined}
        className="ae-input__control ae-body"
        {...extra}
      />
    </div>
  );

  const labelled = (control: React.ReactNode) => (
    <div id={id} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Title field={field} htmlFor={inputId} />
        <Description field={field} id={descId} />
      </div>
      {control}
      <ErrorLine id={errorId} error={error} />
    </div>
  );

  const grouped = (control: React.ReactNode) => (
    <fieldset id={id} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" aria-describedby={describedBy} aria-invalid={invalid}>
      <Title field={field} as="legend" />
      <div className="flex flex-col gap-1">
        <Description field={field} id={descId} />
      </div>
      {control}
      <ErrorLine id={errorId} error={error} />
    </fieldset>
  );

  switch (field.type) {
    case "short_text":
      return labelled(textInput("text", { placeholder: field.placeholder || undefined, maxLength: field.maxLength ?? 1000, autoComplete: "on" }));
    case "email":
      return labelled(textInput("email", { placeholder: field.placeholder || undefined, inputMode: "email", autoComplete: "email", maxLength: 254 }));
    case "phone":
      return labelled(textInput("tel", { placeholder: field.placeholder || undefined, inputMode: "tel", autoComplete: "tel", maxLength: 40 }));
    case "url":
      return labelled(textInput("url", { placeholder: field.placeholder || undefined, inputMode: "url", autoComplete: "url", maxLength: 2000 }));
    case "number":
      return labelled(textInput("text", { placeholder: field.placeholder || undefined, inputMode: field.integer ? "numeric" : "decimal" }));
    case "date":
      return labelled(textInput("date", { min: field.min ?? undefined, max: field.max ?? undefined }));
    case "time":
      return labelled(textInput("time"));
    case "long_text":
      return labelled(
        <div className="ae-input ae-input--multiline" data-invalid={invalid ? "true" : undefined}>
          <textarea
            id={inputId}
            rows={4}
            value={text}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            placeholder={field.placeholder || undefined}
            maxLength={field.maxLength ?? 10000}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            className="ae-input__control ae-body"
          />
          {field.maxLength && (
            <span className="sr-only" aria-live="polite">
              {text.length} of {field.maxLength} characters
            </span>
          )}
        </div>,
      );
    case "dropdown": {
      const choice = asChoice(value);
      return labelled(
        <div className="ae-input ae-input--select ae-input--lg max-w-xl" data-invalid={invalid ? "true" : undefined}>
          <select
            id={inputId}
            value={choice.optionIds[0] ?? ""}
            onChange={(event) => onChange(event.target.value ? { optionIds: [event.target.value], other: null } : emptyChoice)}
            onBlur={onBlur}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            aria-required={field.required || undefined}
            className="ae-input__control ae-body"
          >
            <option value="">Choose an option</option>
            {field.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>,
      );
    }
    case "single_choice":
    case "multi_choice":
      return grouped(<ChoiceControl field={field} value={value} onChange={onChange} describedBy={describedBy} error={error} optionOrder={optionOrder} />);
    case "choice_grid":
    case "checkbox_grid":
      return grouped(<GridControl field={field} value={value} onChange={onChange} error={error} baseId={id} />);
    case "linear_scale": {
      const steps = Array.from({ length: field.max - field.min + 1 }, (_, index) => field.min + index);
      return grouped(
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {steps.map((step) => {
              const checked = value === step;
              return (
                <label
                  key={step}
                  className={cx(
                    "inline-flex size-12 cursor-pointer items-center justify-center rounded-md border ae-label transition-colors duration-150",
                    checked ? "border-primary bg-primary text-on-primary" : "border-border-strong bg-surface text-text hover:bg-bg-subtle",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                  )}
                >
                  <input type="radio" name={id} value={step} checked={checked} onChange={() => onChange(step)} className="sr-only" aria-describedby={describedBy} />
                  {step}
                </label>
              );
            })}
          </div>
          {(field.minLabel || field.maxLabel) && (
            <div className="flex justify-between gap-4 ae-body-sm text-text-muted" style={{ maxWidth: `${steps.length * 56}px` }}>
              <span>
                {field.min} = {field.minLabel}
              </span>
              <span className="text-right">
                {field.max} = {field.maxLabel}
              </span>
            </div>
          )}
        </div>,
      );
    }
    case "rating": {
      const current = typeof value === "number" ? value : 0;
      return grouped(
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: field.max }, (_, index) => index + 1).map((step) => (
            <label key={step} className="cursor-pointer rounded-md p-1 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <input type="radio" name={id} value={step} checked={current === step} onChange={() => onChange(step)} className="sr-only" aria-describedby={describedBy} />
              <span className="sr-only">
                {step} of {field.max} stars
              </span>
              <Star size={36} aria-hidden="true" className={cx("transition-colors duration-150", step <= current ? "fill-current text-accent-text" : "text-border-strong")} />
            </label>
          ))}
        </div>,
      );
    }
    case "consent":
      return grouped(
        <label className={choiceRow(value === true)}>
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} aria-describedby={describedBy} aria-invalid={invalid} className="ae-checkbox" />
          <span className="ae-body text-text">{field.checkboxLabel || "I agree"}</span>
        </label>,
      );
    case "file_upload":
      return grouped(<FileField field={field} value={value} onChange={onChange} describedBy={describedBy} upload={upload} />);
  }
}
