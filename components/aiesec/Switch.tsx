'use client';
import * as React from 'react';
import { cx } from './utils';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> {
  /** What the switch turns on, e.g. "Email notifications". */
  label: React.ReactNode;
  hint?: React.ReactNode;
}

/** An on/off setting that applies immediately (no Save button). For form answers, use Checkbox. */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch({ label, hint, id, className, disabled, ...rest }, ref) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  return (
    <div className={cx('ae-choice', 'ae-choice--switch', className)} data-disabled={disabled ? 'true' : undefined}>
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
      <input ref={ref} id={inputId} type="checkbox" role="switch" className="ae-switch" aria-describedby={hintId} disabled={disabled} {...rest} />
    </div>
  );
});
