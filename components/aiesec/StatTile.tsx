import * as React from 'react';
import { Icon, type IconName } from './icons';
import { cx, type ProgramId } from './utils';

export interface StatDelta {
  /** Signed change, e.g. "+12%" or "-3". Include the sign: colour is never the only cue. */
  value: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether the change is good. Default: up is positive, down negative. */
  intent?: 'positive' | 'negative' | 'neutral';
  /** Comparison, e.g. "vs last month". */
  label?: string;
}

export interface StatTileProps {
  /** What is measured, e.g. "Approvals". */
  label: React.ReactNode;
  /** The figure, formatted for the reader's locale. */
  value: React.ReactNode;
  delta?: StatDelta;
  /** One line of context, e.g. "Goal: 25 this term". */
  caption?: React.ReactNode;
  /** Small icon in front of the label, in the accent colour. */
  icon?: IconName;
  /** Colours the icon with a programme's accent. */
  program?: ProgramId;
  /** Extra content at the bottom, e.g. a Progress towards the goal. */
  footer?: React.ReactNode;
  className?: string;
}

/** A single KPI with its trend, for dashboards. */
export function StatTile({ label, value, delta, caption, icon, program, footer, className }: StatTileProps) {
  const intent = delta?.intent ?? (delta?.direction === 'up' ? 'positive' : delta?.direction === 'down' ? 'negative' : 'neutral');
  const arrow: IconName = delta?.direction === 'up' ? 'arrow-up' : delta?.direction === 'down' ? 'arrow-down' : 'arrow-right';
  return (
    <div className={cx('ae-stat', className)} data-program={program}>
      <p className="ae-stat__label ae-label">
        {icon && <Icon name={icon} size={16} />}
        {label}
      </p>
      <p className="ae-stat__value ae-h2">{value}</p>
      {delta && (
        <p className="ae-stat__delta ae-body-sm" data-intent={intent}>
          <Icon name={arrow} size={16} />
          <span>{delta.value}</span>
          {delta.label && <span className="ae-stat__caption">{delta.label}</span>}
        </p>
      )}
      {caption && <p className="ae-stat__caption ae-body-sm">{caption}</p>}
      {footer}
    </div>
  );
}
