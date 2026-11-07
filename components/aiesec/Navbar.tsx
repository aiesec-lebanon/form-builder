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
  /** Always-visible actions on the right, e.g. a Sign in button or an Avatar. */
  actions?: React.ReactNode;
  /** Sticks to the top while scrolling. */
  sticky?: boolean;
  /** aria-label of the nav landmark. Default "Main". */
  navLabel?: string;
  /** Override the LinkProvider's link component. */
  linkComponent?: React.ElementType;
}

/** The site header: logo, main navigation and actions; below 1024px the links move into a menu. */
export function Navbar({ logo, logoHref = '/', logoLabel = 'AIESEC home', items = [], actions, sticky = false, navLabel = 'Main', linkComponent, className, ...rest }: NavbarProps) {
  const L = useLinkComponent(linkComponent);
  const [open, setOpen] = React.useState(false);
  const drawerId = React.useId();

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
        {items.length > 0 && (
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
      {items.length > 0 && (
        <div id={drawerId} className="ae-navbar__drawer" hidden={!open}>
          <nav className="ae-container" aria-label={navLabel}>
            {links(() => setOpen(false))}
          </nav>
        </div>
      )}
    </header>
  );
}
