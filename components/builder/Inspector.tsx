"use client";

import * as React from "react";

import { Checkbox, Select, Switch, TextField, Textarea } from "@/components/aiesec";
import { definitionOf } from "@/lib/forms/fields";
import { FILE_KIND_LABEL } from "@/lib/forms/fields/other";
import { newId } from "@/lib/forms/ids";
import { FILE_KINDS, LIMITS, isChoiceField, type ChoiceField, type Field, type FileKind, type FormDocument, type Option } from "@/lib/forms/schema";

import { FIELD_ICONS } from "./fieldIcons";
import { LogicEditor } from "./LogicEditor";

type Patch = (patch: Partial<Field>) => void;

/** A number box that tolerates half-typed values and reports null when empty. */
function NumberSetting({ label, value, onChange, min, max, hint }: { label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; hint?: string }) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  const [focused, setFocused] = React.useState(false);
  const shown = focused ? text : value === null ? "" : String(value);
  return (
    <TextField
      label={label}
      hint={hint}
      optional
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      value={shown}
      onFocus={() => {
        setText(value === null ? "" : String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => {
        setText(event.target.value);
        if (event.target.value.trim() === "") return onChange(null);
        const parsed = Number(event.target.value);
        if (!Number.isFinite(parsed)) return;
        const clamped = Math.min(max ?? parsed, Math.max(min ?? parsed, parsed));
        onChange(clamped);
      }}
    />
  );
}

/** Options as one line each; unchanged labels keep their ids. */
function OptionsAsText({ field, onChange }: { field: ChoiceField; onChange: (options: Option[]) => void }) {
  const [text, setText] = React.useState(() => field.options.map((option) => option.label).join("\n"));
  const commit = () => {
    const pool = [...field.options];
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, LIMITS.options);
    const options = lines.map((label) => {
      const index = pool.findIndex((option) => option.label === label);
      if (index !== -1) return pool.splice(index, 1)[0];
      return { id: newId("o"), label };
    });
    onChange(options.length ? options : [{ id: newId("o"), label: "Option 1" }]);
  };
  return <Textarea label="Edit options as text" hint="One option per line. Paste a long list here." rows={6} value={text} onChange={(event) => setText(event.target.value)} onBlur={commit} />;
}

export function FieldSettings({ field, onChange }: { field: Field; onChange: Patch }) {
  switch (field.type) {
    case "short_text":
    case "long_text":
      return (
        <>
          <TextField label="Placeholder" optional value={field.placeholder} maxLength={200} onChange={(event) => onChange({ placeholder: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting label="Min characters" value={field.minLength} min={0} max={field.type === "long_text" ? LIMITS.longText : LIMITS.shortText} onChange={(minLength) => onChange({ minLength })} />
            <NumberSetting label="Max characters" value={field.maxLength} min={1} max={field.type === "long_text" ? LIMITS.longText : LIMITS.shortText} onChange={(maxLength) => onChange({ maxLength })} />
          </div>
        </>
      );
    case "email":
    case "phone":
    case "url":
      return <TextField label="Placeholder" optional value={field.placeholder} maxLength={200} onChange={(event) => onChange({ placeholder: event.target.value })} />;
    case "number":
      return (
        <>
          <TextField label="Placeholder" optional value={field.placeholder} maxLength={200} onChange={(event) => onChange({ placeholder: event.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberSetting label="Minimum" value={field.min} onChange={(min) => onChange({ min })} />
            <NumberSetting label="Maximum" value={field.max} onChange={(max) => onChange({ max })} />
          </div>
          <Switch label="Whole numbers only" checked={field.integer} onChange={(event) => onChange({ integer: event.target.checked })} />
        </>
      );
    case "date":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <TextField label="Earliest date" optional type="date" value={field.min ?? ""} onChange={(event) => onChange({ min: event.target.value || null })} />
          <TextField label="Latest date" optional type="date" value={field.max ?? ""} onChange={(event) => onChange({ max: event.target.value || null })} />
        </div>
      );
    case "single_choice":
    case "multi_choice":
    case "dropdown":
      return (
        <>
          {field.type !== "dropdown" && (
            <>
              <Switch label={"Add an “Other” option"} hint="People can type their own answer." checked={field.allowOther} onChange={(event) => onChange({ allowOther: event.target.checked })} />
              <Switch label="Shuffle options" hint="Each person sees a different order." checked={field.shuffle} onChange={(event) => onChange({ shuffle: event.target.checked })} />
            </>
          )}
          {field.type === "multi_choice" && (
            <div className="grid grid-cols-2 gap-3">
              <NumberSetting label="Min selections" value={field.minSelected} min={1} max={LIMITS.options} onChange={(minSelected) => onChange({ minSelected })} />
              <NumberSetting label="Max selections" value={field.maxSelected} min={1} max={LIMITS.options} onChange={(maxSelected) => onChange({ maxSelected })} />
            </div>
          )}
          {isChoiceField(field) && <OptionsAsText key={field.options.map((option) => option.id).join()} field={field} onChange={(options) => onChange({ options })} />}
        </>
      );
    case "linear_scale":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select label="From" value={String(field.min)} options={[0, 1].map((value) => ({ value: String(value), label: String(value) }))} onChange={(event) => onChange({ min: Number(event.target.value) as 0 | 1 })} />
            <Select
              label="To"
              value={String(field.max)}
              options={Array.from({ length: 9 }, (_, index) => index + 2).map((value) => ({ value: String(value), label: String(value) }))}
              onChange={(event) => onChange({ max: Number(event.target.value) })}
            />
          </div>
          <TextField label="Low end label" optional placeholder="Not likely" value={field.minLabel} maxLength={60} onChange={(event) => onChange({ minLabel: event.target.value })} />
          <TextField label="High end label" optional placeholder="Very likely" value={field.maxLabel} maxLength={60} onChange={(event) => onChange({ maxLabel: event.target.value })} />
        </>
      );
    case "rating":
      return (
        <Select
          label="Number of stars"
          value={String(field.max)}
          options={Array.from({ length: 8 }, (_, index) => index + 3).map((value) => ({ value: String(value), label: String(value) }))}
          onChange={(event) => onChange({ max: Number(event.target.value) })}
        />
      );
    case "file_upload":
      return (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Files per person"
              value={String(field.maxFiles)}
              options={Array.from({ length: 10 }, (_, index) => index + 1).map((value) => ({ value: String(value), label: String(value) }))}
              onChange={(event) => onChange({ maxFiles: Number(event.target.value) })}
            />
            <Select
              label="Size limit"
              value={String(field.maxSizeMb)}
              options={[1, 5, 10, 25, 50, 100].map((value) => ({ value: String(value), label: `${value} MB` }))}
              onChange={(event) => onChange({ maxSizeMb: Number(event.target.value) })}
            />
          </div>
          <fieldset className="ae-fieldset">
            <legend className="ae-fieldset__legend ae-label">Allowed file types</legend>
            <p className="ae-field__hint ae-body-sm">Leave all unticked to accept any file.</p>
            <div className="grid grid-cols-2 gap-2">
              {FILE_KINDS.map((kind) => (
                <Checkbox
                  key={kind}
                  label={FILE_KIND_LABEL[kind]}
                  checked={field.accept.includes(kind)}
                  onChange={(event) => {
                    const accept: FileKind[] = event.target.checked ? [...field.accept, kind] : field.accept.filter((item) => item !== kind);
                    onChange({ accept });
                  }}
                />
              ))}
            </div>
          </fieldset>
        </>
      );
    case "choice_grid":
    case "checkbox_grid":
      return (
        <p className="ae-body-sm text-text-muted">
          Edit rows and columns on the question. Every row uses the same columns. With Required on, people answer every row.
          {field.type === "choice_grid" ? " One answer per row." : " Several answers per row are allowed."}
        </p>
      );
    case "consent":
      return <TextField label="Checkbox text" value={field.checkboxLabel} maxLength={500} onChange={(event) => onChange({ checkboxLabel: event.target.value })} />;
    case "statement":
      return <p className="ae-body-sm text-text-muted">Text blocks show a heading and text. They don&apos;t collect answers.</p>;
  }
}

const SHORTCUTS: Array<[string, string]> = [
  ["/", "Add a question"],
  ["Ctrl Z", "Undo"],
  ["Ctrl Shift Z", "Redo"],
  ["Ctrl D", "Duplicate question"],
  ["Alt ↑ ↓", "Move question"],
  ["Delete", "Delete question"],
  ["Esc", "Deselect"],
];

export function Inspector({ field, onChange, questionCount, pageCount, doc }: { field: Field | null; onChange: Patch; questionCount: number; pageCount: number; doc: FormDocument }) {
  if (!field) {
    return (
      <div className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="ae-h4">Question settings</h2>
          <p className="ae-body-sm text-text-muted">Select a question to change its settings.</p>
        </div>
        <p className="ae-body-sm text-text-muted">
          {questionCount} question{questionCount === 1 ? "" : "s"} · {pageCount} page{pageCount === 1 ? "" : "s"}
        </p>
        <div className="flex flex-col gap-2">
          <h3 className="ae-label-sm text-text-muted uppercase">Shortcuts</h3>
          <dl className="flex flex-col gap-2">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={action} className="flex items-center justify-between gap-3 ae-body-sm">
                <dt className="text-text">{action}</dt>
                <dd className="flex gap-1">
                  {keys.split(" ").map((key) => (
                    <kbd key={key} className="rounded-sm border border-border bg-bg-subtle px-1.5 py-0.5 ae-caption text-text-muted">
                      {key}
                    </kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    );
  }
  const definition = definitionOf(field.type);
  const Icon = FIELD_ICONS[field.type];
  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary-text">
          <Icon size={18} aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h2 className="ae-label text-text">{definition.name}</h2>
          <p className="ae-caption text-text-muted">{definition.hint}</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <FieldSettings field={field} onChange={onChange} />
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <h3 className="ae-label-sm text-text-muted uppercase">Logic</h3>
        <LogicEditor doc={doc} target={{ fieldId: field.id }} value={field.visibleIf} onChange={(visibleIf) => onChange({ visibleIf })} />
      </div>
    </div>
  );
}
