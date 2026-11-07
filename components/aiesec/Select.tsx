'use client';
import * as React from 'react';
import { Field, type FieldBaseProps } from './Field';
import { cx } from './utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends FieldBaseProps, Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** The choices. Or pass `<option>` children. */
  options?: SelectOption[];
  /** First, unselectable line shown until a choice is made, e.g. "Choose a programme". */
  placeholder?: string;
  /** 32, 40 or 48px tall. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
}

/** A labelled native select: accessible, mobile-friendly, styled to match the inputs. */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, hint, error, optional, options, placeholder, size = 'md', id, className, children, value, defaultValue, disabled, ...rest },
  ref,
) {
  const autoId = React.useId();
  const selectId = id ?? autoId;
  const uncontrolledDefault = value === undefined && defaultValue === undefined && placeholder ? '' : defaultValue;

  return (
    <Field id={selectId} label={label} hideLabel={hideLabel} hint={hint} error={error} optional={optional} className={className}>
      {(describedBy) => (
        <div
          className={cx('ae-input', 'ae-input--select', size !== 'md' && `ae-input--${size}`)}
          data-invalid={error ? 'true' : undefined}
          data-disabled={disabled ? 'true' : undefined}
        >
          <select
            ref={ref}
            id={selectId}
            className={cx('ae-input__control', size === 'sm' ? 'ae-body-sm' : 'ae-body')}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={value}
            defaultValue={uncontrolledDefault}
            disabled={disabled}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options?.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
            {children}
          </select>
        </div>
      )}
    </Field>
  );
});
