'use client';
import * as React from 'react';
import { Field, type FieldBaseProps } from './Field';
import { Icon } from './icons';
import { cx } from './utils';

export interface TextFieldProps extends FieldBaseProps, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Icon inside the start of the input, e.g. `<Icon name="search" />`. */
  iconStart?: React.ReactNode;
  /** 32, 40 or 48px tall. `sm` is for dense desktop tables only (14px text zooms on iOS). Default `md`. */
  size?: 'sm' | 'md' | 'lg';
}

/** A labelled single-line input. `type="password"` adds a show/hide toggle. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, optional: _optional, required, iconStart, size = 'md', id, className, type = 'text', disabled, ...rest },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = React.useState(false);
  const isPassword = type === 'password';

  return (
    <Field id={inputId} label={label} hideLabel={hideLabel} hint={hint} error={error} required={required} className={className}>
      {(describedBy) => (
        <div
          className={cx('ae-input', size !== 'md' && `ae-input--${size}`, type === 'date' && 'ae-input--date')}
          data-invalid={error ? 'true' : undefined}
          data-disabled={disabled ? 'true' : undefined}
        >
          {iconStart && <span className="ae-input__adornment">{iconStart}</span>}
          <input
            ref={ref}
            id={inputId}
            type={isPassword && revealed ? 'text' : type}
            className={cx('ae-input__control', size === 'sm' ? 'ae-body-sm' : 'ae-body')}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            required={required}
            {...rest}
          />
          {isPassword && (
            <button
              type="button"
              className="ae-input__action"
              aria-label="Show password"
              aria-pressed={revealed}
              aria-controls={inputId}
              disabled={disabled}
              onClick={() => setRevealed((v) => !v)}
            >
              <Icon name={revealed ? 'eye-off' : 'eye'} size={20} />
            </button>
          )}
        </div>
      )}
    </Field>
  );
});
