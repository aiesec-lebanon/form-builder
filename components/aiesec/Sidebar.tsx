'use client';
import * as React from 'react';
import { Icon, type IconName } from './icons';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface SidebarItem {
  label: string;
  href: string;
  icon?: IconName;
  /** Marks the current page (aria-current="page"). */
  current?: boolean;
  /** Trailing count or status, e.g. `<Badge tone="danger">3</Badge>`. */
  badge?: React.ReactNode;
}

export interface SidebarSection {
  /** Optional group heading, e.g. "Exchange". */
  title?: string;
  items: SidebarItem[];
}

export interface SidebarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  sections: SidebarSection[];
  /** aria-label of the nav landmark. Default "Sidebar". */
  label?: string;
  /** Content above the sections, e.g. the entity name or a logo. */
  header?: React.ReactNode;
  /** Content pinned to the bottom, e.g. the signed-in member. */
  footer?: React.ReactNode;
  linkComponent?: React.ElementType;
}

/** Secondary, vertical navigation for dashboards and tools (desktop; below 1024px put these links in the Navbar menu). */
export function Sidebar({ sections, label = 'Sidebar', header, footer, linkComponent, className, ...rest }: SidebarProps) {
  const L = useLinkComponent(linkComponent);
  const baseId = React.useId();
  return (
    <nav className={cx('ae-sidebar', className)} aria-label={label} {...rest}>
      {header}
      {sections.map((section, s) => {
        const headingId = section.title ? `${baseId}-${s}` : undefined;
        return (
          <div className="ae-sidebar__section" key={section.title ?? s}>
            {section.title && (
              <p id={headingId} className="ae-sidebar__heading ae-label-sm">
                {section.title}
              </p>
            )}
            <ul className="ae-sidebar__list" aria-labelledby={headingId}>
              {section.items.map((item) => (
                <li key={item.href}>
                  <L href={item.href} className={cx('ae-sidebar__item', item.current ? 'ae-label' : 'ae-body-sm')} aria-current={item.current ? 'page' : undefined}>
                    {item.icon && <Icon name={item.icon} size={20} />}
                    <span className="ae-sidebar__label">{item.label}</span>
                    {item.badge}
                  </L>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {footer && <div className="ae-sidebar__footer">{footer}</div>}
    </nav>
  );
}
