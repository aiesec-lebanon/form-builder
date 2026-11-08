'use client';
import { Button, FieldError, Label, ListBox, ListBoxItem, Popover, Select as AriaSelect, SelectValue, Text } from 'react-aria-components';
import { RequiredMark, type FieldBaseProps } from './Field';
import { ThemePortal, useThemeScope } from './hooks';
import { Icon } from './icons';
import { cx } from './utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends FieldBaseProps {
  options: SelectOption[];
  /** Shown until a choice is made, e.g. "Choose a programme". */
  placeholder?: string;
  /** Selected value (controlled). */
  value?: string | null;
  /** Initial value (uncontrolled). */
  defaultValue?: string;
  onChange?: (value: string | null) => void;
  /** Submits the value with a form under this name. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** 32, 40 or 48px tall. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  className?: string;
}

/** A labelled select with a styled list popover: full keyboard, typeahead and screen-reader support (React Aria). */
export function Select({
  label,
  hideLabel,
  hint,
  error,
  options,
  placeholder,
  value,
  defaultValue,
  onChange,
  name,
  disabled,
  required,
  size = 'md',
  id,
  className,
}: SelectProps) {
  const [ref, scope] = useThemeScope<HTMLDivElement>();
  return (
    <AriaSelect
      ref={ref}
      id={id}
      className={cx('ae-field', className)}
      placeholder={placeholder}
      value={value}
      defaultValue={defaultValue}
      onChange={(key) => onChange?.(key === null ? null : String(key))}
      name={name}
      isDisabled={disabled}
      isRequired={required}
      isInvalid={error ? true : undefined}
    >
      <Label className={cx('ae-field__label', 'ae-label', hideLabel && 'ae-sr-only')}>
        {label}
        {required && <RequiredMark announce />}
      </Label>
      <Button className={cx('ae-input', 'ae-select', size !== 'md' && `ae-input--${size}`)}>
        <SelectValue className={cx('ae-select__value', size === 'sm' ? 'ae-body-sm' : 'ae-body')}>
          {({ isPlaceholder, selectedText, defaultChildren }) => (isPlaceholder ? defaultChildren : selectedText)}
        </SelectValue>
        <Icon name="chevron-down" size={20} className="ae-select__chevron" />
      </Button>
      {hint && (
        <Text slot="description" className="ae-field__hint ae-body-sm">
          {hint}
        </Text>
      )}
      <FieldError className="ae-field__error ae-body-sm">
        <Icon name="circle-alert" size={16} />
        <span>
          <span className="ae-sr-only">Error: </span>
          {error}
        </span>
      </FieldError>
      <ThemePortal scope={scope}>
        <Popover className="ae-popover" offset={6}>
          <ListBox className="ae-listbox" items={options}>
            {(option) => (
              <ListBoxItem id={option.value} textValue={option.label} isDisabled={option.disabled} className="ae-option ae-body">
                <span className="ae-option__label">{option.label}</span>
                <Icon name="check" size={16} className="ae-option__check" />
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ThemePortal>
    </AriaSelect>
  );
}
