'use client';
import * as React from 'react';
import { FieldError, RequiredMark } from './Field';
import { cx } from './utils';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode;
  hint?: React.ReactNode;
}

/** One radio option. Use inside RadioGroup (or your own fieldset with a legend). */
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(function Radio({ label, hint, id, className, disabled, ...rest }, ref) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cx('ae-choice', className)} data-disabled={disabled ? 'true' : undefined}>
      <input ref={ref} id={inputId} type="radio" className="ae-radio" aria-describedby={hintId} disabled={disabled} {...rest} />
      <div className="ae-choice__text">
        <label htmlFor={inputId} className="ae-body">
          {label}
        </label>
        {hint && (
          <span id={hintId} className="ae-choice__hint ae-body-sm">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
});

export interface RadioOption {
  value: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  /** The question, e.g. "Which programme are you applying for?". */
  legend: React.ReactNode;
  /** Form field name shared by the options. */
  name: string;
  options: RadioOption[];
  /** Controlled value. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, event: React.ChangeEvent<HTMLInputElement>) => void;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Horizontal only for two or three short options. Default `vertical`. */
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/** One choice from a short list (two to six options), all visible at once. */
export function RadioGroup({ legend, name, options, value, defaultValue, onChange, hint, error, orientation = 'vertical', disabled, required, className }: RadioGroupProps) {
  const baseId = React.useId();
  const hintId = hint ? `${baseId}-hint` : undefined;
  const errorId = error ? `${baseId}-error` : undefined;
  return (
    <fieldset className={cx('ae-fieldset', className)} aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined} disabled={disabled}>
      <legend className="ae-fieldset__legend ae-label">
        {legend}
        {required && <RequiredMark />}
      </legend>
      {hint && (
        <p id={hintId} className="ae-field__hint ae-body-sm">
          {hint}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
      <div className="ae-fieldset__options" data-orientation={orientation}>
        {options.map((o) => (
          <Radio
            key={o.value}
            name={name}
            value={o.value}
            label={o.label}
            hint={o.hint}
            disabled={o.disabled}
            required={required}
            aria-invalid={error ? true : undefined}
            checked={value === undefined ? undefined : value === o.value}
            defaultChecked={value === undefined && defaultValue !== undefined ? defaultValue === o.value : undefined}
            onChange={(event) => onChange?.(o.value, event)}
          />
        ))}
      </div>
    </fieldset>
  );
}
