'use client';
import * as React from 'react';
import { cx } from './utils';

export interface ProgressProps {
  /** Omit for indeterminate (unknown duration). */
  value?: number;
  /** Default 100. */
  max?: number;
  /** What is progressing, e.g. "Approvals towards goal". */
  label: string;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  /** Shows the value at the end of the label line. */
  showValue?: boolean;
  /** Spoken and shown value, e.g. "18 of 25 approvals". Default: the percentage. */
  valueText?: string;
  /** Default `primary`; `accent` follows data-program. */
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'accent';
  /** 8px (`md`) or 4px (`sm`) tall. */
  size?: 'sm' | 'md';
  className?: string;
}

/** A horizontal bar for determinate progress (towards a goal) or ongoing work. */
export function Progress({ value, max = 100, label, hideLabel = false, showValue = false, valueText, tone = 'primary', size = 'md', className }: ProgressProps) {
  const labelId = React.useId();
  const percent = value === undefined ? undefined : Math.min(100, Math.max(0, (value / max) * 100));
  const shown = valueText ?? (percent === undefined ? undefined : `${Math.round(percent)}%`);
  return (
    <div className={cx('ae-progress', size === 'sm' && 'ae-progress--sm', tone !== 'primary' && `ae-tone-${tone}`, className)} data-indeterminate={percent === undefined ? 'true' : undefined}>
      {!hideLabel && (
        <div className="ae-progress__meta ae-body-sm">
          <span id={labelId}>{label}</span>
          {showValue && shown && <span className="ae-progress__value">{shown}</span>}
        </div>
      )}
      <div
        className="ae-progress__track"
        role="progressbar"
        aria-labelledby={hideLabel ? undefined : labelId}
        aria-label={hideLabel ? label : undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
      >
        <div className="ae-progress__bar" style={percent === undefined ? undefined : { width: `${percent}%` }} />
      </div>
    </div>
  );
}
