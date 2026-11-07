'use client';
import * as React from 'react';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** An <img> (alt text included) or Image, shown 16:9 at the top. */
  media?: React.ReactNode;
  title?: React.ReactNode;
  /** One line under the title with the facts people scan for, e.g. "Tripoli, Lebanon · 6 weeks". */
  meta?: React.ReactNode;
  /** Heading level that fits the page outline. Default `h3`. */
  titleAs?: 'h2' | 'h3' | 'h4';
  /** Makes the whole card one link (the title is the link text). */
  href?: string;
  /** Actions or metadata at the bottom; stay separately clickable. */
  footer?: React.ReactNode;
  linkComponent?: React.ElementType;
}

/** A self-contained summary of one thing (an opportunity, an event, a project) that links to its detail. */
export function Card({ media, title, meta, titleAs: Heading = 'h3', href, footer, linkComponent, className, children, ...rest }: CardProps) {
  const L = useLinkComponent(linkComponent);
  return (
    <article className={cx('ae-card', href && 'ae-card--interactive', className)} {...rest}>
      {media && <div className="ae-card__media">{media}</div>}
      <div className="ae-card__content">
        {title && (
          <Heading className="ae-card__title ae-h4">
            {href ? (
              <L href={href} className="ae-card__link">
                {title}
              </L>
            ) : (
              title
            )}
          </Heading>
        )}
        {meta && <p className="ae-card__meta ae-body-sm">{meta}</p>}
        {children && <div className="ae-card__body ae-body">{children}</div>}
      </div>
      {footer && <div className="ae-card__footer">{footer}</div>}
    </article>
  );
}
