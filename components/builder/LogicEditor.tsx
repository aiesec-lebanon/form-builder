"use client";

import { GitBranch } from "lucide-react";
import * as React from "react";

import { Select, TextField, cx } from "@/components/aiesec";
import { conditionSources, describeCondition, needsValue, operatorsFor } from "@/lib/forms/logic";
import { isChoiceField, type Condition, type ConditionOperator, type Field, type FormDocument } from "@/lib/forms/schema";

const OPERATOR_TEXT: Record<ConditionOperator, string> = {
  is: "is",
  is_not: "is not",
  contains: "contains",
  answered: "is answered",
  not_answered: "is not answered",
};

function defaultCondition(source: Field): Condition {
  const operator = operatorsFor(source)[0];
  return { fieldId: source.id, operator, value: isChoiceField(source) ? (source.options[0]?.id ?? "") : "" };
}

type Props = {
  doc: FormDocument;
  target: { fieldId?: string; pageId?: string };
  value: Condition | null;
  onChange: (condition: Condition | null) => void;
  noun?: "question" | "page";
};

/** "Show this question only when <earlier question> <rule> <value>". */
export function LogicEditor({ doc, target, value, onChange, noun = "question" }: Props) {
  const sources = conditionSources(doc, target);
  const source = value ? sources.find((field) => field.id === value.fieldId) : undefined;
  const name = React.useId();

  if (sources.length === 0) {
    return <p className="ae-body-sm text-text-muted">To show this {noun} only for some people, first add a question before it.</p>;
  }

  return (
    <fieldset className="ae-fieldset">
      <legend className="ae-fieldset__legend ae-label">Show this {noun}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {[
          { id: "always", label: "Always" },
          { id: "when", label: "Only when…" },
        ].map((option) => {
          const checked = option.id === "always" ? value === null : value !== null;
          return (
            <label
              key={option.id}
              className={cx(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 ae-body-sm transition-colors duration-150",
                "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                checked ? "border-primary bg-primary-soft text-primary-text" : "border-border text-text hover:border-border-strong",
              )}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                className="sr-only"
                onChange={() => onChange(option.id === "always" ? null : (value ?? defaultCondition(sources[sources.length - 1])))}
              />
              {option.label}
            </label>
          );
        })}
      </div>

      {value && (
        <div className="flex flex-col gap-3">
          <Select
            label="Question"
            value={source ? source.id : ""}
            placeholder="Choose a question"
            options={sources.map((field, index) => ({ value: field.id, label: field.label.trim() || `Question ${index + 1}` }))}
            onChange={(event) => {
              const next = sources.find((field) => field.id === event.target.value);
              if (next) onChange(defaultCondition(next));
            }}
            error={source ? undefined : "That question was moved or deleted. Choose another."}
          />
          {source && (
            <Select
              label="Rule"
              value={value.operator}
              options={operatorsFor(source).map((operator) => ({ value: operator, label: OPERATOR_TEXT[operator] }))}
              onChange={(event) => onChange({ ...value, operator: event.target.value as ConditionOperator })}
            />
          )}
          {source &&
            needsValue(value.operator) &&
            (isChoiceField(source) ? (
              <Select
                label="Answer"
                value={value.value}
                placeholder="Choose an answer"
                options={source.options.map((option, index) => ({ value: option.id, label: option.label.trim() || `Option ${index + 1}` }))}
                onChange={(event) => onChange({ ...value, value: event.target.value })}
              />
            ) : (
              <TextField label="Answer" value={value.value} maxLength={500} onChange={(event) => onChange({ ...value, value: event.target.value })} />
            ))}
        </div>
      )}
    </fieldset>
  );
}

/** "Shown when …" from a precomputed description (keeps memoized cards cheap). */
export function LogicBadge({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-sm bg-accent-soft px-2 py-1 ae-caption text-accent-text">
      <GitBranch size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">Shown when {text}</span>
    </span>
  );
}

/** Compact "Shown when …" marker for cards and page headers. */
export function LogicChip({ doc, condition }: { doc: FormDocument; condition: Condition | null }) {
  if (!condition) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-sm bg-accent-soft px-2 py-1 ae-caption text-accent-text">
      <GitBranch size={14} aria-hidden="true" className="shrink-0" />
      <span className="truncate">Shown when {describeCondition(doc, condition)}</span>
    </span>
  );
}
