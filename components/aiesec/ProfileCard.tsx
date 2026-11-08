'use client';
import * as React from 'react';
import { Avatar } from './Avatar';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface ProfileCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** Full name: the card's title and the source of the initials. */
  name: string;
  /** Photo URL; falls back to initials. */
  src?: string;
  /** Their position, e.g. "Team Leader, Incoming Global Volunteer". */
  position?: React.ReactNode;
  /** Their LC or entity, e.g. "AIESEC in Beirut". */
  entity?: React.ReactNode;
  /** Heading level that fits the page outline. Default `h3`. */
  titleAs?: 'h2' | 'h3' | 'h4';
  /** Makes the whole card one link to the full profile (the name is the link text). */
  href?: string;
  /** Actions at the bottom, e.g. Message; they stay separately clickable. */
  footer?: React.ReactNode;
  linkComponent?: React.ElementType;
}

/** A member at a glance for team pages, directories and leaderboards: photo, name, position and LC. */
export function ProfileCard({ name, src, position, entity, titleAs: Heading = 'h3', href, footer, linkComponent, className, children, ...rest }: ProfileCardProps) {
  const L = useLinkComponent(linkComponent);
  return (
    <article className={cx('ae-card', 'ae-profile-card', href && 'ae-card--interactive', className)} {...rest}>
      <div className="ae-card__content">
        <Avatar name={name} src={src} size="xl" decorative />
        <div className="ae-profile-card__who">
          <Heading className="ae-card__title ae-h4">
            {href ? (
              <L href={href} className="ae-card__link">
                {name}
              </L>
            ) : (
              name
            )}
          </Heading>
          {position && <p className="ae-card__meta ae-body-sm">{position}</p>}
          {entity && <p className="ae-card__meta ae-body-sm">{entity}</p>}
        </div>
        {children && <div className="ae-profile-card__body ae-body-sm">{children}</div>}
      </div>
      {footer && <div className="ae-card__footer">{footer}</div>}
    </article>
  );
}
