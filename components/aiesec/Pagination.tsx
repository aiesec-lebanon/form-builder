'use client';
import * as React from 'react';
import { Icon } from './icons';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface PaginationProps {
  /** Current page, starting at 1. */
  page: number;
  pageCount: number;
  /** Button mode: called with the new page. */
  onPageChange?: (page: number) => void;
  /** Link mode (preferred for crawlable lists): the URL of a page. */
  hrefFor?: (page: number) => string;
  /** Pages shown on each side of the current one. Default 1. */
  siblingCount?: number;
  /** aria-label of the nav landmark. Default "Pagination". */
  label?: string;
  linkComponent?: React.ElementType;
  className?: string;
}

/** Page numbers with gaps: 1 … 4 5 6 … 20. */
export function pageItems(page: number, pageCount: number, siblingCount = 1): Array<number | 'gap'> {
  if (pageCount <= siblingCount * 2 + 5) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const start = Math.max(Math.min(page - siblingCount, pageCount - siblingCount * 2 - 2), 3);
  const end = Math.min(Math.max(page + siblingCount, siblingCount * 2 + 3), pageCount - 2);
  const items: Array<number | 'gap'> = [1, start > 3 ? 'gap' : 2];
  for (let p = start; p <= end; p++) items.push(p);
  items.push(end < pageCount - 2 ? 'gap' : pageCount - 1, pageCount);
  return items;
}

/** Moves through a long, ordered list split into pages. */
export function Pagination({ page, pageCount, onPageChange, hrefFor, siblingCount = 1, label = 'Pagination', linkComponent, className }: PaginationProps) {
  const L = useLinkComponent(linkComponent);
  if (pageCount <= 1) return null;

  const control = (target: number, content: React.ReactNode, extra: Record<string, unknown> = {}) => {
    const disabled = target < 1 || target > pageCount;
    const common = { className: 'ae-pagination__item ae-label', 'aria-disabled': disabled || undefined, ...extra };
    if (hrefFor) return <L href={disabled ? undefined : hrefFor(target)} {...common}>{content}</L>;
    return (
      <button type="button" {...common} onClick={disabled ? undefined : () => onPageChange?.(target)}>
        {content}
      </button>
    );
  };

  return (
    <nav aria-label={label} className={className}>
      <ul className={cx('ae-pagination__list')}>
        <li>
          {control(page - 1, <><Icon name="chevron-left" size={20} className="ae-icon--flip" /><span>Previous</span></>)}
        </li>
        {pageItems(page, pageCount, siblingCount).map((item, i) => (
          <li key={item === 'gap' ? `gap-${i}` : item}>
            {item === 'gap' ? (
              <span className="ae-pagination__gap" aria-hidden="true">
                …
              </span>
            ) : (
              control(item, item, { 'aria-label': `Page ${item}`, 'aria-current': item === page ? 'page' : undefined })
            )}
          </li>
        ))}
        <li>
          {control(page + 1, <><span>Next</span><Icon name="chevron-right" size={20} className="ae-icon--flip" /></>)}
        </li>
      </ul>
    </nav>
  );
}
