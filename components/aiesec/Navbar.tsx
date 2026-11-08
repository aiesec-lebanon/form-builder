'use client';
import * as React from 'react';
import { Button } from './Button';
import { Icon } from './icons';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface NavbarItem {
  label: string;
  href: string;
  /** Marks the current page (aria-current="page"). */
  current?: boolean;
}

export interface NavbarProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** The AIESEC logo (or a programme logo) as an <img>/<svg> with alt="" (the link is named by `logoLabel`). */
  logo: React.ReactNode;
  logoHref?: string;
  /** Accessible name of the logo link. Default "AIESEC home". */
  logoLabel?: string;
  /** Primary destinations, five or fewer. */
  items?: NavbarItem[];
  /** Calls to action on the right, e.g. Sign in and Join AIESEC; below 1024px they move into the menu. */
  actions?: React.ReactNode;
  /** The signed-in person's ProfileMenu; stays in the bar at every width. */
  profile?: React.ReactNode;
  /** Sticks to the top while scrolling. */
  sticky?: boolean;
  /** aria-label of the nav landmark. Default "Main". */
  navLabel?: string;
  /** Override the LinkProvider's link component. */
  linkComponent?: React.ElementType;
}

/** The site header: logo, main navigation, actions and the profile button; below 1024px the links and actions move into a menu. */
export function Navbar({ logo, logoHref = '/', logoLabel = 'AIESEC home', items = [], actions, profile, sticky = false, navLabel = 'Main', linkComponent, className, ...rest }: NavbarProps) {
  const L = useLinkComponent(linkComponent);
  const [open, setOpen] = React.useState(false);
  const drawerId = React.useId();
  const hasMenu = items.length > 0 || !!actions;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links = (onNavigate?: () => void) => (
    <ul className="ae-navbar__list">
      {items.map((item) => (
        <li key={item.href}>
          <L href={item.href} className="ae-navbar__link ae-body" aria-current={item.current ? 'page' : undefined} onClick={onNavigate}>
            {item.label}
          </L>
        </li>
      ))}
    </ul>
  );

  return (
    <header className={cx('ae-navbar', sticky && 'ae-navbar--sticky', className)} {...rest}>
      <div className="ae-container ae-navbar__inner">
        <L href={logoHref} className="ae-navbar__brand" aria-label={logoLabel}>
          {logo}
        </L>
        {items.length > 0 && (
          <nav className="ae-navbar__nav" aria-label={navLabel}>
            {links()}
          </nav>
        )}
        {actions && <div className="ae-navbar__actions">{actions}</div>}
        {profile && <div className="ae-navbar__profile">{profile}</div>}
        {hasMenu && (
          <Button
            variant="ghost"
            iconOnly
            className="ae-navbar__toggle"
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? 'x' : 'menu'} size={24} />
          </Button>
        )}
      </div>
      {hasMenu && (
        <div id={drawerId} className="ae-navbar__drawer" hidden={!open}>
          <div className="ae-container">
            {items.length > 0 && <nav aria-label={navLabel}>{links(() => setOpen(false))}</nav>}
            {actions && <div className="ae-navbar__actions">{actions}</div>}
          </div>
        </div>
      )}
    </header>
  );
}
