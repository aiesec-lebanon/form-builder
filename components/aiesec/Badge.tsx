import * as React from 'react';
import { cx, type ProgramId, type Tone } from './utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Meaning of the colour. Default `neutral`. */
  tone?: Tone;
  /** `soft` (tint, default) or `solid` (status only; programme and accent badges stay soft). */
  variant?: 'soft' | 'solid';
  /** Programme badge: the programme's colours (sets data-program, forces soft). */
  program?: ProgramId;
  /** Leading icon, e.g. `<Icon name="check" size={16} />`. */
  icon?: React.ReactNode;
}

/** A short status or category label next to the thing it describes. One or two words. */
export function Badge({ tone = 'neutral', variant = 'soft', program, icon, className, children, ...rest }: BadgeProps) {
  const effectiveTone: Tone = program ? 'accent' : tone;
  const solid = variant === 'solid' && effectiveTone !== 'accent';
  return (
    <span className={cx('ae-badge', 'ae-caption', `ae-tone-${effectiveTone}`, solid && 'ae-badge--solid', className)} data-program={program} {...rest}>
      {icon}
      {children}
    </span>
  );
}
