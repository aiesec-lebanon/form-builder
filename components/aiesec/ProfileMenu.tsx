'use client';
import * as React from 'react';
import { Button, Dialog, DialogTrigger, Popover } from 'react-aria-components';
import { Avatar } from './Avatar';
import { ThemePortal, useThemeScope } from './hooks';
import { Icon, type IconName } from './icons';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export interface ProfileMenuLink {
  label: string;
  href: string;
  icon?: IconName;
}

export interface ProfileMenuProps {
  /** The signed-in person's full name. */
  name: string;
  /** Photo URL; without one the button shows the user icon. */
  src?: string;
  /** Their position, e.g. "LCVP Incoming Global Volunteer". */
  position?: React.ReactNode;
  /** Their LC or entity, e.g. "AIESEC in Beirut". */
  entity?: React.ReactNode;
  email?: string;
  /** Links in the card, e.g. My profile and Settings. */
  links?: ProfileMenuLink[];
  /** Adds "Sign out" at the end of the card. */
  onSignOut?: () => void;
  /** Names the button and the card for screen readers. Default "Account". */
  label?: string;
  linkComponent?: React.ElementType;
  className?: string;
}

/** The profile button for the Navbar: the photo (or the user icon) opens a card with who is signed in, their links and Sign out. */
export function ProfileMenu({ name, src, position, entity, email, links = [], onSignOut, label = 'Account', linkComponent, className }: ProfileMenuProps) {
  const L = useLinkComponent(linkComponent);
  const [ref, scope] = useThemeScope<HTMLDivElement>();
  return (
    <div ref={ref} className={cx('ae-profile-menu', className)}>
      <DialogTrigger>
        <Button className="ae-profile-menu__trigger" aria-label={`${label}, ${name}`}>
          {src ? <Avatar name={name} src={src} decorative /> : <Icon name="user" size={20} />}
        </Button>
        <ThemePortal scope={scope}>
          <Popover className="ae-popover ae-profile-menu__popover" placement="bottom end" offset={8}>
            <Dialog className="ae-profile-menu__dialog" aria-label={label}>
              {({ close }) => (
                <>
                  <div className="ae-profile-menu__who">
                    <Avatar name={name} src={src} size="lg" decorative />
                    <div className="ae-profile-menu__text">
                      <p className="ae-label">{name}</p>
                      {position && <p className="ae-body-sm">{position}</p>}
                      {entity && <p className="ae-body-sm">{entity}</p>}
                      {email && <p className="ae-profile-menu__email ae-body-sm">{email}</p>}
                    </div>
                  </div>
                  {(links.length > 0 || onSignOut) && (
                    <ul className="ae-profile-menu__list">
                      {links.map((link) => (
                        <li key={link.href}>
                          <L href={link.href} className="ae-profile-menu__item ae-body-sm" onClick={close}>
                            {link.icon && <Icon name={link.icon} size={20} />}
                            {link.label}
                          </L>
                        </li>
                      ))}
                      {onSignOut && (
                        <li className="ae-profile-menu__end">
                          <button
                            type="button"
                            className="ae-profile-menu__item ae-body-sm"
                            onClick={() => {
                              close();
                              onSignOut();
                            }}
                          >
                            <Icon name="log-out" size={20} />
                            Sign out
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </Dialog>
          </Popover>
        </ThemePortal>
      </DialogTrigger>
    </div>
  );
}
