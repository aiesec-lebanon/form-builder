'use client';
import * as React from 'react';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface ListProps extends React.HTMLAttributes<HTMLUListElement> {
  /** Hairlines between rows. Default true. */
  divided?: boolean;
}

/** A vertical list of similar items (members, opportunities, documents). Children are ListItems. */
export function List({ divided = true, className, children, ...rest }: ListProps) {
  return (
    <ul className={cx('ae-list', divided && 'ae-list--divided', className)} {...rest}>
      {children}
    </ul>
  );
}

export interface ListItemProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Icon or Avatar before the text. */
  leading?: React.ReactNode;
  /** Meta or a Badge after the text. */
  trailing?: React.ReactNode;
  /** Makes the whole row a link. */
  href?: string;
  linkComponent?: React.ElementType;
}

/** One row of a List. */
export function ListItem({ title, description, leading, trailing, href, linkComponent }: ListItemProps) {
  const L = useLinkComponent(linkComponent);
  const content = (
    <>
      {leading && <span className="ae-list__leading">{leading}</span>}
      <span className="ae-list__content">
        <span className="ae-list__title ae-body">{title}</span>
        {description && <span className="ae-list__description ae-body-sm">{description}</span>}
      </span>
      {trailing && <span className="ae-list__trailing ae-body-sm">{trailing}</span>}
    </>
  );
  return (
    <li>
      {href ? (
        <L href={href} className="ae-list__row ae-list__link">
          {content}
        </L>
      ) : (
        <div className="ae-list__row">{content}</div>
      )}
    </li>
  );
}
