import * as React from 'react';
import { cx } from './utils';

export interface RequiredNoteProps {
  /** What the asterisk means. Default "Required". */
  children?: React.ReactNode;
  className?: string;
}

/** "* Required" once at the top of a form with required fields, for people who don't know the asterisk. */
export function RequiredNote({ children = 'Required', className }: RequiredNoteProps) {
  return (
    <p className={cx('ae-required-note', 'ae-body-sm', className)}>
      <span className="ae-required">*</span> {children}
    </p>
  );
}
