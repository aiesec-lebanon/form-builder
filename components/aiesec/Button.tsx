'use client';
import * as React from 'react';
import { Spinner } from './Spinner';
import { useLinkComponent } from './LinkProvider';
import { cx } from './utils';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost' | 'link';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Use `primary` at most once per view. Default `secondary`. */
  variant?: ButtonVariant;
  /** 32, 40 or 48px tall. Default `md`. */
  size?: 'sm' | 'md' | 'lg';
  /** Shows a spinner, keeps the width, sets aria-busy and ignores clicks (stays focusable). */
  loading?: boolean;
  /** Icon before the label, e.g. `<Icon name="search" />`. */
  iconStart?: React.ReactNode;
  /** Icon after the label. */
  iconEnd?: React.ReactNode;
  /** Square, icon-only button. Requires `aria-label`. */
  iconOnly?: boolean;
  /** Fills the container width. */
  block?: boolean;
  /** Renders as a link (with the LinkProvider's component) when set. */
  href?: string;
  /** Render a different element or component. */
  as?: React.ElementType;
}

/** Triggers an action, or navigates when given `href`. */
export const Button = React.forwardRef<HTMLElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, iconStart, iconEnd, iconOnly = false, block = false, href, as, className, children, disabled, type, onClick, ...rest },
  ref,
) {
  const LinkComp = useLinkComponent();
  const Comp: React.ElementType = as ?? (href !== undefined ? LinkComp : 'button');
  const isNativeButton = Comp === 'button';
  const blocked = loading || (!isNativeButton && disabled);
  const typeClass = variant === 'link' ? undefined : size === 'sm' ? 'ae-label' : 'ae-body';

  return (
    <Comp
      ref={ref}
      href={href}
      className={cx('ae-btn', `ae-btn--${variant}`, size !== 'md' && `ae-btn--${size}`, iconOnly && 'ae-btn--icon', block && 'ae-btn--block', typeClass, className)}
      type={isNativeButton ? (type ?? 'button') : undefined}
      disabled={isNativeButton ? disabled : undefined}
      aria-disabled={blocked || undefined}
      aria-busy={loading || undefined}
      onClick={blocked ? (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault() : onClick}
      {...rest}
    >
      {iconStart}
      {children}
      {iconEnd}
      {loading && (
        <span className="ae-btn__spinner" aria-hidden="true">
          <Spinner size="sm" label="" />
        </span>
      )}
    </Comp>
  );
});
