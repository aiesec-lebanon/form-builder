'use client';
import * as React from 'react';
import { Field, type FieldBaseProps } from './Field';
import { cx } from './utils';

export interface TextareaProps extends FieldBaseProps, React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Character limit. With `showCount`, people may type past it and see how many to remove (no hard cut-off). */
  maxLength?: number;
  /** Shows "n of max characters" under the field. */
  showCount?: boolean;
}

/** A labelled multi-line input for answers longer than a line (motivation letters, feedback). */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hideLabel, hint, error, optional, id, className, rows = 4, maxLength, showCount = false, value, defaultValue, onChange, disabled, ...rest },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const [length, setLength] = React.useState(() => String(value ?? defaultValue ?? '').length);
  const current = value !== undefined ? String(value).length : length;
  const over = maxLength !== undefined && current > maxLength;

  const count =
    showCount && maxLength !== undefined ? (
      <p className="ae-field__count ae-caption" data-over={over ? 'true' : undefined} aria-live="polite">
        {over ? `${current - maxLength} characters too many` : `${current} of ${maxLength} characters`}
      </p>
    ) : null;

  return (
    <Field id={inputId} label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} className={className} after={count}>
      {(describedBy) => (
        <div className="ae-input ae-input--multiline" data-invalid={error || over ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined}>
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
            className={cx('ae-input__control', 'ae-body')}
            aria-invalid={error || over ? true : undefined}
            aria-describedby={describedBy}
            maxLength={showCount ? undefined : maxLength}
            value={value}
            defaultValue={defaultValue}
            disabled={disabled}
            onChange={(event) => {
              setLength(event.target.value.length);
              onChange?.(event);
            }}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
});
