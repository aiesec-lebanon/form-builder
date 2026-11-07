'use client';
import * as React from 'react';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface BreadcrumbItem {
  label: string;
  /** Omit on the last item (the current page). */
  href?: string;
}

export interface BreadcrumbsProps {
  /** From the top level to the current page, which comes last. */
  items: BreadcrumbItem[];
  /** aria-label of the nav landmark. Default "Breadcrumb". */
  label?: string;
  linkComponent?: React.ElementType;
  className?: string;
}

/** Shows where a page sits in the hierarchy and links back up it. */
export function Breadcrumbs({ items, label = 'Breadcrumb', linkComponent, className }: BreadcrumbsProps) {
  const L = useLinkComponent(linkComponent);
  return (
    <nav aria-label={label} className={className}>
      <ol className={cx('ae-breadcrumbs', 'ae-body-sm')}>
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`}>
              {last || !item.href ? <span aria-current={last ? 'page' : undefined}>{item.label}</span> : <L href={item.href}>{item.label}</L>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
