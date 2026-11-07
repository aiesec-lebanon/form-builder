'use client';
import * as React from 'react';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface FooterLink {
  label: string;
  href: string;
}

export interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

export interface FooterProps {
  /** The AIESEC logo (<img>/<svg>), alt text included. */
  logo?: React.ReactNode;
  /** Default: the Blue Book tagline "Activating youth leadership since 1948." */
  tagline?: React.ReactNode;
  /** Up to three link groups. */
  groups?: FooterLinkGroup[];
  /** Bottom line, e.g. "© 2026 AIESEC in Lebanon" and policy links. */
  legal?: React.ReactNode;
  linkComponent?: React.ElementType;
  className?: string;
}

/** The site footer: logo, tagline, grouped links and the legal line. */
export function Footer({ logo, tagline = 'Activating youth leadership since 1948.', groups = [], legal, linkComponent, className }: FooterProps) {
  const L = useLinkComponent(linkComponent);
  return (
    <footer className={cx('ae-footer', className)}>
      <div className="ae-container">
        <div className="ae-footer__main">
          <div className="ae-footer__brand">
            {logo}
            <p className="ae-footer__tagline ae-body-sm">{tagline}</p>
          </div>
          {groups.length > 0 && (
            <nav aria-label="Footer" className="ae-footer__groups">
              {groups.map((group) => (
                <div key={group.title}>
                  <h2 className="ae-footer__group-title ae-label">{group.title}</h2>
                  <ul className="ae-footer__links ae-body-sm">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <L href={link.href}>{link.label}</L>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          )}
        </div>
        {legal && <div className="ae-footer__legal ae-caption">{legal}</div>}
      </div>
    </footer>
  );
}
