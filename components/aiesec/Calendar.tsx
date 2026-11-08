'use client';
import { parseDate, type CalendarDate } from '@internationalized/date';
import { Calendar as AriaCalendar } from 'react-aria-components';
import { CalendarViews } from './CalendarViews';
import { cx } from './utils';

/** Internal: `YYYY-MM-DD` to a React Aria date; undefined stays undefined (uncontrolled), empty becomes null. */
export const toDate = (iso?: string | null): CalendarDate | null | undefined => (iso === undefined ? undefined : iso ? parseDate(iso) : null);

export interface CalendarProps {
  /** Names the calendar for screen readers, e.g. "Event date". */
  'aria-label': string;
  /** Selected date as `YYYY-MM-DD` (controlled). */
  value?: string | null;
  /** Initial date as `YYYY-MM-DD` (uncontrolled). */
  defaultValue?: string;
  /** Called with `YYYY-MM-DD`. */
  onChange?: (value: string) => void;
  /** Earliest and latest allowed dates, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
}

/** A calendar on the page (DatePicker shows the same one in a popover): the month and year in its header zoom out for quick jumps. */
export function Calendar({ value, defaultValue, onChange, min, max, disabled, className, ...rest }: CalendarProps) {
  return (
    <AriaCalendar
      aria-label={rest['aria-label']}
      className={cx('ae-calendar', 'ae-calendar--inline', className)}
      value={toDate(value)}
      defaultValue={toDate(defaultValue)}
      onChange={(date) => onChange?.(date.toString())}
      minValue={toDate(min) ?? undefined}
      maxValue={toDate(max) ?? undefined}
      isDisabled={disabled}
    >
      <CalendarViews />
    </AriaCalendar>
  );
}
