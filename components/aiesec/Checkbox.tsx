'use client';
import * as React from 'react';
import { FieldError, RequiredMark } from './Field';
import { cx } from './utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Visible label; clicking it toggles the box. */
  label: React.ReactNode;
  /** Help text under the label. */
  hint?: React.ReactNode;
  /** Mixed state for "select all" when only some children are checked. */
  indeterminate?: boolean;
  /** Error message (e.g. "Accept the privacy policy to continue"); sets aria-invalid. */
  error?: React.ReactNode;
}

/** A single yes/no choice, or one option in a list where several can be chosen. */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, indeterminate = false, error, id, className, disabled, required, ...rest },
  ref,
) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const inner = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);
  React.useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={cx('ae-field', className)}>
      <div className="ae-choice" data-disabled={disabled ? 'true' : undefined}>
        <input
          ref={inner}
          id={inputId}
          type="checkbox"
          className="ae-checkbox"
          aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          required={required}
          {...rest}
        />
        <div className="ae-choice__text">
          <label htmlFor={inputId} className="ae-body">
            {label}
            {required && <RequiredMark />}
          </label>
          {hint && (
            <span id={hintId} className="ae-choice__hint ae-body-sm">
              {hint}
            </span>
          )}
        </div>
      </div>
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
});
