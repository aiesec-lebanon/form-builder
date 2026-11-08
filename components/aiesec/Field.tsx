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
  /** @deprecated Optional fields are no longer marked; set `required` on required ones (red asterisk). Removed in 4.0.0. */
  optional?: boolean;
}

interface FieldProps extends FieldBaseProps {
  id: string;
  /** Adds the red asterisk after the label. */
  required?: boolean;
  className?: string;
  /** Extra line under the control (e.g. a character count). */
  after?: React.ReactNode;
  children: (describedBy: string | undefined) => React.ReactNode;
}

/** Internal: label, control, hint and error wiring shared by every text-like field. */
export function Field({ id, label, hideLabel, hint, error, required, className, after, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('ae-field', className)}>
      <label htmlFor={id} className={cx('ae-field__label', 'ae-label', hideLabel && 'ae-sr-only')}>
        {label}
        {required && <RequiredMark />}
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

/**
 * Internal: the red asterisk after a required field's label. Screen readers skip it and hear "required" from the control;
 * `announce` adds that word for controls that can't carry `required` themselves (the Select button).
 */
export function RequiredMark({ announce = false }: { announce?: boolean }) {
  return (
    <>
      <span className="ae-required" aria-hidden="true">
        *
      </span>
      {announce && <span className="ae-sr-only"> (required)</span>}
    </>
  );
}
