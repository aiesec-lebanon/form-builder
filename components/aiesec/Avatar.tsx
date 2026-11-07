'use client';
import * as React from 'react';
import { cx } from './utils';

export interface AvatarProps {
  /** Full name: the accessible name and the source of the initials. */
  name: string;
  /** Photo URL; falls back to initials if missing or broken. */
  src?: string;
  /** 24, 32, 40 or 64px. Default `md` (32px). */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Hide from screen readers when the name is written next to it. */
  decorative?: boolean;
  className?: string;
}

/** Up to two initials from a name: "Lina Haddad" gives "LH". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** A member's photo, or their initials on the accent tint. */
export function Avatar({ name, src, size = 'md', decorative = false, className }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  return (
    <span
      className={cx('ae-avatar', size !== 'md' && `ae-avatar--${size}`, className)}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <span aria-hidden="true">{initials(name)}</span>}
    </span>
  );
}
