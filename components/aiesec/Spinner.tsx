import { cx } from './utils';

export interface SpinnerProps {
  /** 16, 20 or 32px. Default `md` (20px). */
  size?: 'sm' | 'md' | 'lg';
  /** Announced text. Pass `''` when a parent already says it is busy (e.g. a loading Button). Default 'Loading'. */
  label?: string;
  className?: string;
}

/** An indeterminate loading indicator in `currentColor`. */
export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  const ring = <span className={cx('ae-spinner', size !== 'md' && `ae-spinner--${size}`, className)} aria-hidden="true" />;
  if (!label) return ring;
  return (
    <span role="status" style={{ display: 'inline-flex' }}>
      {ring}
      <span className="ae-sr-only">{label}</span>
    </span>
  );
}
