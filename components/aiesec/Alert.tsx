'use client';
import * as React from 'react';
import { Icon } from './icons';
import { cx, TONE_ICON, TONE_LABEL, type StatusTone } from './utils';

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Default `info`. */
  tone?: StatusTone;
  /** One short line; the body explains. */
  title?: React.ReactNode;
  /** Buttons or links that resolve the message. */
  actions?: React.ReactNode;
  /** Shows a close button. Omit for messages people must not miss. */
  onDismiss?: () => void;
  /** Announce when it appears (role="alert" for danger, "status" otherwise). Leave off for alerts present on page load. */
  live?: boolean;
  dismissLabel?: string;
}

/** An inline message about the page or a section: info, success, warning or error. */
export function Alert({ tone = 'info', title, actions, onDismiss, live = false, dismissLabel = 'Dismiss', className, children, ...rest }: AlertProps) {
  return (
    <div className={cx('ae-alert', `ae-tone-${tone}`, className)} role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined} {...rest}>
      <Icon name={TONE_ICON[tone]} size={20} label={TONE_LABEL[tone]} className="ae-alert__icon" />
      <div className="ae-alert__body">
        {title && <p className="ae-alert__title ae-label">{title}</p>}
        {children && <div className="ae-alert__text ae-body-sm">{children}</div>}
        {actions && <div className="ae-alert__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="ae-close" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon name="x" size={20} />
        </button>
      )}
    </div>
  );
}
