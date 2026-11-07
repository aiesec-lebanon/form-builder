import * as React from 'react';
import { Icon } from './icons';
import { cx } from './utils';

/** Props every labelled form control shares. */
export interface FieldBaseProps {
  /** Visible label. Required: placeholders are not labels. */
  label: React.ReactNode;
  /** Keeps the label for screen readers only (e.g. a search box with a visible button). */
  hideLabel?: boolean;
  /** Help text under the control. */
  hint?: React.ReactNode;
  /** Error message; also sets aria-invalid. Say what went wrong and how to fix it. */
  error?: React.ReactNode;
  /** Marks the field "(optional)". Mark optional fields, not required ones. */
  optional?: boolean;
}

interface FieldProps extends FieldBaseProps {
  id: string;
  className?: string;
  /** Extra line under the control (e.g. a character count). */
  after?: React.ReactNode;
  children: (describedBy: string | undefined) => React.ReactNode;
}

/** Internal: label, control, hint and error wiring shared by every text-like field. */
export function Field({ id, label, hideLabel, hint, error, optional, className, after, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ae-field', className)}>
      <label htmlFor={id} className={cx('ae-field__label', 'ae-label', hideLabel && 'ae-sr-only')}>
        {label}
        {optional && <span className="ae-field__optional"> (optional)</span>}
      </label>
      {children(describedBy)}
      {hint && (
        <p id={hintId} className="ae-field__hint ae-body-sm">
          {hint}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
      {after}
    </div>
  );
}

/** Internal: the error line (icon + "Error:" for screen readers + message). */
export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="ae-field__error ae-body-sm">
      <Icon name="circle-alert" size={16} />
      <span>
        <span className="ae-sr-only">Error: </span>
        {children}
      </span>
    </p>
  );
}
