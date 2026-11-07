'use client';
import * as React from 'react';
import { Icon } from './icons';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  /** Opens in a new tab: adds target and rel, an icon and "(opens in a new tab)" for screen readers. */
  external?: boolean;
  /** Render a different link component for this link only (else the LinkProvider's, else `<a>`). */
  as?: React.ElementType;
}

/** An inline text link: AIESEC Blue, always underlined. */
export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link({ external = false, as, className, children, ...rest }, ref) {
  const Comp = useLinkComponent(external ? 'a' : as);
  return (
    <Comp ref={ref} className={cx('ae-link', className)} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : null)} {...rest}>
      {children}
      {external && (
        <>
          <Icon name="external-link" size={16} className="ae-link__external" />
          <span className="ae-sr-only"> (opens in a new tab)</span>
        </>
      )}
    </Comp>
  );
});
