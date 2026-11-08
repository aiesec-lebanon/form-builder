"use client";

import { Check, ChevronDown, CircleAlert } from "lucide-react";
import { Button, ComboBox, FieldError, Group, Input, Label, ListBox, ListBoxItem, Popover, Select, SelectValue, Text } from "react-aria-components";

import { ThemePortal, useThemeScope } from "@/components/aiesec/hooks";
import { RequiredMark } from "@/components/aiesec/Field";
import type { ChoiceValue } from "@/lib/forms/fields";
import type { FieldOf } from "@/lib/forms/schema";

import { linkify } from "./linkify";

// The design system's Select (React Aria list popover: keyboard, typeahead,
// screen readers), laid out like every other question: title and description
// above, error below. Long lists (e.g. AIESEC entities) become a searchable
// combo box. Loaded on demand, so forms without a dropdown never download React Aria.

/** Above this many options people can type to filter the list. */
export const SEARCHABLE_FROM = 13;

type Props = {
  field: FieldOf<"dropdown">;
  value: ChoiceValue;
  error?: string;
  onChange: (value: ChoiceValue) => void;
  /** Wrapper id, used to scroll to the question from the error summary. */
  id: string;
  number?: number;
};

function Heading({ field, number }: { field: FieldOf<"dropdown">; number?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="ae-body-lg font-bold text-text">
        {number ? <span className="fb-qnum">{number}.</span> : null}
        {field.label || "Untitled question"}
        {field.required && <RequiredMark />}
      </Label>
      {field.description && (
        <Text slot="description" className="block whitespace-pre-line ae-body-sm text-text-muted">
          {linkify(field.description)}
        </Text>
      )}
    </div>
  );
}

function ErrorText({ error }: { error?: string }) {
  return (
    <FieldError className="ae-field__error ae-body-sm">
      <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>
        <span className="sr-only">Error: </span>
        {error}
      </span>
    </FieldError>
  );
}

function Options({ field, scope }: { field: FieldOf<"dropdown">; scope: HTMLElement | null }) {
  return (
    <ThemePortal scope={scope}>
      <Popover className="ae-popover" offset={6}>
        <ListBox className="ae-listbox" items={field.options} renderEmptyState={() => <p className="px-2.5 py-2 ae-body-sm text-text-muted">No matches</p>}>
          {(option) => (
            <ListBoxItem id={option.id} textValue={option.label} className="ae-option ae-body">
              <span className="ae-option__label">{option.label}</span>
              <Check size={16} aria-hidden="true" className="ae-option__check shrink-0" />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ThemePortal>
  );
}

export function DropdownQuestion({ field, value, error, onChange, id, number }: Props) {
  const [ref, scope] = useThemeScope<HTMLDivElement>();
  const selected = value.optionIds[0];
  const known = selected !== undefined && field.options.some((option) => option.id === selected);
  const choose = (key: React.Key | null) => onChange({ optionIds: key === null ? [] : [String(key)], other: null });

  if (field.options.length >= SEARCHABLE_FROM) {
    return (
      <ComboBox
        ref={ref}
        id={id}
        className="ae-field flex flex-col gap-3"
        selectedKey={known ? selected : null}
        onSelectionChange={choose}
        defaultFilter={(text, input) => text.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase())}
        menuTrigger="focus"
        isInvalid={Boolean(error)}
        isRequired={field.required}
        validationBehavior="aria"
      >
        <Heading field={field} number={number} />
        <Group className="ae-input ae-input--lg max-w-xl">
          <Input data-focus-target="" placeholder="Type to search" className="ae-input__control ae-body" />
          <Button className="ae-input__action" aria-label="Show all options">
            <ChevronDown size={20} aria-hidden="true" />
          </Button>
        </Group>
        <ErrorText error={error} />
        <Options field={field} scope={scope} />
      </ComboBox>
    );
  }

  return (
    <Select
      ref={ref}
      id={id}
      className="ae-field flex flex-col gap-3"
      placeholder="Choose an option"
      value={known ? selected : null}
      onChange={choose}
      isInvalid={Boolean(error)}
      isRequired={field.required}
      validationBehavior="aria"
    >
      <Heading field={field} number={number} />
      <Button data-focus-target="" className="ae-input ae-input--lg ae-select max-w-xl">
        <SelectValue className="ae-select__value ae-body">{({ isPlaceholder, selectedText, defaultChildren }) => (isPlaceholder ? defaultChildren : selectedText)}</SelectValue>
        <ChevronDown size={20} aria-hidden="true" className="ae-select__chevron shrink-0" />
      </Button>
      <ErrorText error={error} />
      <Options field={field} scope={scope} />
    </Select>
  );
}
