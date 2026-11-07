import * as React from 'react';
import { cx } from './utils';

export interface ContainerProps extends React.HTMLAttributes<HTMLElement> {
  /** Element to render, e.g. 'main' or 'section'. Default 'div'. */
  as?: React.ElementType;
}

/** Centres content at `ae-container` (1280px) with responsive side margins (16px, then 32px from 640px). */
export function Container({ as: Comp = 'div', className, ...rest }: ContainerProps) {
  return <Comp className={cx('ae-container', className)} {...rest} />;
}

/** The responsive column grid: 4 columns, 8 from 640px, 12 from 1024px. Children are GridItems. */
export function Grid({ as: Comp = 'div', className, ...rest }: ContainerProps) {
  return <Comp className={cx('ae-grid', className)} {...rest} />;
}

export interface GridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Columns on mobile, 1 to 4. Default 4 (full). */
  span?: 1 | 2 | 3 | 4;
  /** Columns from 640px, 1 to 8. Default 8 (full). */
  tablet?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Columns from 1024px, 1 to 12. Default 12 (full). */
  desktop?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
}

type SpanStyle = React.CSSProperties & Record<'--ae-span' | '--ae-span-tablet' | '--ae-span-desktop', number | undefined>;

/** One cell of a Grid; each breakpoint's span is explicit and defaults to full width. */
export function GridItem({ span, tablet, desktop, className, style, ...rest }: GridItemProps) {
  const spans: SpanStyle = { '--ae-span': span, '--ae-span-tablet': tablet, '--ae-span-desktop': desktop, ...style };
  return <div className={cx('ae-col', className)} style={spans} {...rest} />;
}
