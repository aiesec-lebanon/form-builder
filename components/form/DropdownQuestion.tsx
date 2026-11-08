"use client";

import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { Button, FieldError, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, Text } from "react-aria-components";

import { ThemePortal, useThemeScope } from "@/components/aiesec/hooks";
import type { ChoiceValue } from "@/lib/forms/fields";
import type { FieldOf } from "@/lib/forms/schema";

import { linkify } from "./linkify";

// The design system's Select (React Aria list popover: keyboard, typeahead,
// screen readers), laid out like every other question: title and description
// above, error below. Loaded on demand, so forms without a dropdown never
// download React Aria.

type Props = {
  field: FieldOf<"dropdown">;
  value: ChoiceValue;
  error?: string;
  onChange: (value: ChoiceValue) => void;
  /** Wrapper id, used to scroll to the question from the error summary. */
  id: string;
};

export function DropdownQuestion({ field, value, error, onChange, id }: Props) {
  const [ref, scope] = useThemeScope<HTMLDivElement>();
  const selected = value.optionIds[0];
  const known = selected !== undefined && field.options.some((option) => option.id === selected);

  return (
    <Select
      ref={ref}
      id={id}
      className="ae-field flex flex-col gap-3"
      placeholder="Choose an option"
      value={known ? selected : null}
      onChange={(key) => onChange({ optionIds: key === null ? [] : [String(key)], other: null })}
      isInvalid={Boolean(error)}
      isRequired={field.required}
      validationBehavior="aria"
    >
      <div className="flex flex-col gap-1">
        <Label className="ae-body-lg font-bold text-text">
          {field.label || "Untitled question"}
          {!field.required && <span className="font-normal text-text-muted"> (optional)</span>}
        </Label>
        {field.description && (
          <Text slot="description" className="block whitespace-pre-line ae-body-sm text-text-muted">
            {linkify(field.description)}
          </Text>
        )}
      </div>
      <Button data-focus-target="" className="ae-input ae-input--lg ae-select max-w-xl">
        <SelectValue className="ae-select__value ae-body">{({ isPlaceholder, selectedText, defaultChildren }) => (isPlaceholder ? defaultChildren : selectedText)}</SelectValue>
        <ChevronDown size={20} aria-hidden="true" className="ae-select__chevron shrink-0" />
      </Button>
      <FieldError className="ae-field__error ae-body-sm">
        <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          <span className="sr-only">Error: </span>
          {error}
        </span>
      </FieldError>
      <ThemePortal scope={scope}>
        <Popover className="ae-popover" offset={6}>
          <ListBox className="ae-listbox" items={field.options}>
            {(option) => (
              <ListBoxItem id={option.id} textValue={option.label} className="ae-option ae-body">
                <span className="ae-option__label">{option.label}</span>
                <Check size={16} aria-hidden="true" className="ae-option__check shrink-0" />
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ThemePortal>
    </Select>
  );
}
