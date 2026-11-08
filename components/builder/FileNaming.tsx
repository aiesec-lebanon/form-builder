"use client";

import { Plus, X } from "lucide-react";

import { Button, Select, Switch } from "@/components/aiesec";
import { collectsAnswer } from "@/lib/forms/fields";
import { questionName, questionNumbers, shorten } from "@/lib/forms/numbering";
import { allFields, FILE_NAME_SEPARATORS, type Field, type FileNaming, type FormDocument } from "@/lib/forms/schema";

type FileField = Extract<Field, { type: "file_upload" }>;

const MAX_PARTS = 3;
const SEPARATOR_LABEL: Record<FileNaming["separator"], string> = { _: "Underscore (_)", "-": "Dash (-)", " ": "Space" };
const NOT_NAMEABLE = new Set<Field["type"]>(["file_upload", "choice_grid", "checkbox_grid"]);

/** Earlier questions whose answers can go in a file name. */
export function namingSources(doc: FormDocument, fieldId: string): Field[] {
  const fields = allFields(doc);
  const position = fields.findIndex((field) => field.id === fieldId);
  return fields.slice(0, Math.max(position, 0)).filter((field) => collectsAnswer(field) && !NOT_NAMEABLE.has(field.type));
}

const labelOf = (field: Field) => field.label.trim() || "Untitled question";

/** What a renamed file looks like, e.g. "[Full name]_[LC]_1.pdf" (long questions shortened). */
export function namingPreview(naming: FileNaming, sources: Field[]): string {
  const parts = naming.fieldIds.map((id) => sources.find((field) => field.id === id)).filter((field): field is Field => Boolean(field));
  return [...parts.map((field) => `[${shorten(labelOf(field), 24)}]`), ...(naming.index ? ["1"] : [])].join(naming.separator) + ".pdf";
}

/** Optional naming format for a file question's uploads (applied once a response is sent). */
export function FileNamingSettings({ field, doc, onChange }: { field: FileField; doc: FormDocument; onChange: (patch: Partial<Field>) => void }) {
  const sources = namingSources(doc, field.id);
  const numbers = questionNumbers(allFields(doc));
  const naming = field.naming;
  const setNaming = (next: FileNaming | null) => onChange({ naming: next } as Partial<Field>);
  // Parts whose question was deleted or moved below drop out of the editor.
  const parts = naming ? naming.fieldIds.filter((id) => sources.some((source) => source.id === id)) : [];
  const options = (current: string | null) =>
    sources.filter((source) => source.id === current || !parts.includes(source.id)).map((source) => ({ value: source.id, label: questionName(source, numbers.get(source.id)) }));
  const setParts = (fieldIds: string[]) => naming && fieldIds.length > 0 && setNaming({ ...naming, fieldIds });

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <Switch
        label="Rename uploaded files"
        hint={sources.length === 0 ? "Add a question before this one, like Full name, to name files from its answer." : "Name files in Drive from earlier answers. Off keeps each file's own name."}
        checked={Boolean(naming)}
        disabled={sources.length === 0 && !naming}
        onChange={(event) => {
          if (!event.target.checked) return setNaming(null);
          const first = sources.find((source) => /name/i.test(source.label)) ?? sources[0];
          if (first) setNaming({ fieldIds: [first.id], separator: "_", index: true });
        }}
      />
      {naming && (
        <>
          <div className="flex flex-col gap-2">
            {(parts.length > 0 ? parts : [null]).map((id, index) => (
              <div key={id ?? "empty"} className="flex items-end gap-2">
                <Select
                  className="min-w-0 flex-1"
                  label={index === 0 ? "Name from" : `Then`}
                  placeholder="Choose a question"
                  value={id}
                  options={options(id)}
                  onChange={(value) => {
                    if (!value) return;
                    const next = parts.length > 0 ? parts.map((part, at) => (at === index ? value : part)) : [value];
                    setParts(next);
                  }}
                />
                {parts.length > 1 && (
                  <Button variant="ghost" iconOnly aria-label={`Remove ${id ? labelOf(sources.find((source) => source.id === id)!) : "part"}`} onClick={() => setParts(parts.filter((_, at) => at !== index))}>
                    <X size={16} aria-hidden="true" />
                  </Button>
                )}
              </div>
            ))}
            {parts.length > 0 && parts.length < MAX_PARTS && parts.length < sources.length && (
              <Button
                variant="tertiary"
                size="sm"
                className="self-start"
                iconStart={<Plus size={16} aria-hidden="true" />}
                onClick={() => {
                  const next = sources.find((source) => !parts.includes(source.id));
                  if (next) setParts([...parts, next.id]);
                }}
              >
                Add another answer
              </Button>
            )}
          </div>
          <Select
            label="Between parts"
            value={naming.separator}
            options={FILE_NAME_SEPARATORS.map((separator) => ({ value: separator, label: SEPARATOR_LABEL[separator] }))}
            onChange={(value) => value && setNaming({ ...naming, separator: value as FileNaming["separator"] })}
          />
          <Switch label="Add a number" hint="1, 2, 3… for each file someone uploads here." checked={naming.index} onChange={(event) => setNaming({ ...naming, index: event.target.checked })} />
          <p className="ae-body-sm text-text-muted">
            Files are renamed when the response is sent, like <span className="font-mono text-text break-all">{namingPreview({ ...naming, fieldIds: parts }, sources)}</span>. Empty answers are left out, so required questions work best.
          </p>
        </>
      )}
    </div>
  );
}
