'use client';
import { Button, Calendar as AriaCalendar, DateInput, DatePicker as AriaDatePicker, DateSegment, Dialog, FieldError, Group, Label, Popover, Text } from 'react-aria-components';
import { toDate } from './Calendar';
import { CalendarViews } from './CalendarViews';
import { RequiredMark, type FieldBaseProps } from './Field';
import { ThemePortal, useThemeScope } from './hooks';
import { Icon } from './icons';
import { cx } from './utils';

export interface DatePickerProps extends FieldBaseProps {
  /** Selected date as `YYYY-MM-DD` (controlled). */
  value?: string | null;
  /** Initial date as `YYYY-MM-DD` (uncontrolled). */
  defaultValue?: string;
  /** Called with `YYYY-MM-DD`, or null when cleared. */
  onChange?: (value: string | null) => void;
  /** Earliest and latest allowed dates, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  /** Submits the value (`YYYY-MM-DD`) with a form under this name. */
  name?: string;
  disabled?: boolean;
  required?: boolean;
  /** 32, 40 or 48px tall. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  className?: string;
}

/** A labelled date field: type the date in the reader's locale, or pick it from a calendar whose month and year zoom out for quick jumps (React Aria). */
export function DatePicker({
  label,
  hideLabel,
  hint,
  error,
  value,
  defaultValue,
  onChange,
  min,
  max,
  name,
  disabled,
  required,
  size = 'md',
  id,
  className,
}: DatePickerProps) {
  const [ref, scope] = useThemeScope<HTMLDivElement>();
  return (
    <AriaDatePicker
      ref={ref}
      id={id}
      className={cx('ae-field', className)}
      value={toDate(value)}
      defaultValue={toDate(defaultValue)}
      onChange={(date) => onChange?.(date ? date.toString() : null)}
      minValue={toDate(min) ?? undefined}
      maxValue={toDate(max) ?? undefined}
      name={name}
      isDisabled={disabled}
      isRequired={required}
      isInvalid={error ? true : undefined}
    >
      <Label className={cx('ae-field__label', 'ae-label', hideLabel && 'ae-sr-only')}>
        {label}
        {required && <RequiredMark />}
      </Label>
      <Group className={cx('ae-input', 'ae-date', size !== 'md' && `ae-input--${size}`)}>
        <DateInput className={cx('ae-date__input', size === 'sm' ? 'ae-body-sm' : 'ae-body')}>
          {(segment) => <DateSegment segment={segment} className="ae-date__segment" />}
        </DateInput>
        <Button className="ae-input__action">
          <Icon name="calendar" size={20} />
        </Button>
      </Group>
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
        <Popover className="ae-popover ae-popover--calendar" placement="bottom start" offset={6}>
          <Dialog className="ae-calendar-dialog">
            <AriaCalendar className="ae-calendar">
              <CalendarViews />
            </AriaCalendar>
          </Dialog>
        </Popover>
      </ThemePortal>
    </AriaDatePicker>
  );
}
