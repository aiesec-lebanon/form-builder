import { cx } from './utils';

export interface SkeletonProps {
  /** `text` lines follow the font size; `rect` and `circle` take width and height. Default `text`. */
  shape?: 'text' | 'rect' | 'circle';
  width?: number | string;
  height?: number | string;
  /** Several text lines; the last is shorter. */
  lines?: number;
  className?: string;
}

/** A placeholder in the shape of content that is loading. Hidden from screen readers: mark the region aria-busy. */
export function Skeleton({ shape = 'text', width, height, lines = 1, className }: SkeletonProps) {
  if (shape === 'text' && lines > 1) {
    return (
      <span className={cx('ae-skeleton-lines', className)} aria-hidden="true" style={{ width }}>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="ae-skeleton ae-skeleton--text" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
        ))}
      </span>
    );
  }
  return <span className={cx('ae-skeleton', `ae-skeleton--${shape}`, className)} aria-hidden="true" style={{ width, height }} />;
}
