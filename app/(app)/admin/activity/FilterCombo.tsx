"use client";

import { Check, ChevronDown, X } from "lucide-react";
import * as React from "react";
import { Button, ComboBox, Group, Input, Label, ListBox, ListBoxItem, Popover } from "react-aria-components";

import { ThemePortal, useThemeScope } from "@/components/aiesec/hooks";

// A filter that offers only values that exist in the data, as a searchable,
// scrollable list (React Aria combo box with the design system's input and
// popover). The chosen value is submitted with the filter form under `name`.

export type FilterOption = { value: string; label: string; detail?: string };

const matches = (text: string, input: string) => text.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase());

type Props = {
  label: string;
  name: string;
  options: FilterOption[];
  defaultValue?: string;
  placeholder: string;
};

export function FilterCombo({ label, name, options, defaultValue, placeholder }: Props) {
  const [ref, scope] = useThemeScope<HTMLDivElement>();
  const [selected, setSelected] = React.useState<string | null>(() => (defaultValue && options.some((option) => option.value === defaultValue) ? defaultValue : null));

  return (
    <ComboBox
      ref={ref}
      className="ae-field"
      name={name}
      formValue="key"
      defaultItems={options}
      selectedKey={selected}
      onSelectionChange={(key) => setSelected(key === null ? null : String(key))}
      defaultFilter={matches}
      menuTrigger="focus"
    >
      <Label className="ae-field__label ae-label">{label}</Label>
      <Group className="ae-input ae-input--sm">
        <Input placeholder={placeholder} className="ae-input__control ae-body-sm" />
        {selected !== null && (
          <button type="button" className="ae-input__action" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => setSelected(null)}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <Button className="ae-input__action" aria-label={`Show all ${label.toLowerCase()} options`}>
          <ChevronDown size={18} aria-hidden="true" />
        </Button>
      </Group>
      <ThemePortal scope={scope}>
        {/* React Aria sizes the popover inline; maxHeight keeps long lists short and scrollable. */}
        <Popover className="ae-popover" offset={6} maxHeight={288}>
          <ListBox<FilterOption> className="ae-listbox" renderEmptyState={() => <p className="px-2.5 py-2 ae-body-sm text-text-muted">No matches</p>}>
            {(option) => (
              <ListBoxItem id={option.value} textValue={option.label} className="ae-option ae-body-sm">
                <span className="ae-option__label flex min-w-0 flex-col py-1">
                  <span className="truncate">{option.label}</span>
                  {option.detail && <span className="truncate ae-caption text-text-muted">{option.detail}</span>}
                </span>
                <Check size={16} aria-hidden="true" className="ae-option__check shrink-0" />
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ThemePortal>
    </ComboBox>
  );
}
