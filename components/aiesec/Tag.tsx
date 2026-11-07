'use client';
import * as React from 'react';
import { Icon } from './icons';
import { cx, type ProgramId } from './utils';

export interface TagProps {
  children: React.ReactNode;
  /** Filter mode: a toggle button (aria-pressed). */
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** Removable mode: shows an × button. */
  onRemove?: () => void;
  /** Accessible name of the × button. Default "Remove <label>". */
  removeLabel?: string;
  /** Selected state in a programme's colours. */
  program?: ProgramId;
  disabled?: boolean;
  className?: string;
}

/** An interactive chip: a filter that toggles on and off, or a chosen value that can be removed. */
export function Tag({ children, selected = false, onSelectedChange, onRemove, removeLabel, program, disabled, className }: TagProps) {
  if (onRemove) {
    const name = removeLabel ?? `Remove ${typeof children === 'string' ? children : ''}`.trim();
    return (
      <span className={cx('ae-tag', 'ae-label', className)} data-program={program}>
        {children}
        <button type="button" className="ae-tag__remove" aria-label={name} onClick={onRemove} disabled={disabled}>
          <Icon name="x" size={16} />
        </button>
      </span>
    );
  }
  return (
    <button type="button" className={cx('ae-tag', 'ae-label', className)} aria-pressed={selected} data-program={program} disabled={disabled} onClick={() => onSelectedChange?.(!selected)}>
      {selected && <Icon name="check" size={16} />}
      {children}
    </button>
  );
}
