'use client';
import * as React from 'react';
import { prefersStill, useIsoLayoutEffect } from './hooks';
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
  /** A number counts up when it appears and is formatted for the reader's locale; pass a string or node to show it as is. */
  value: number | React.ReactNode;
  delta?: StatDelta;
  /** One line of context, e.g. "Goal: 25 this term". */
  caption?: React.ReactNode;
  /** Small icon in front of the label. */
  icon?: IconName;
  /** Sets data-program for programme-specific content (e.g. a Progress in the footer). */
  program?: ProgramId;
  /** Extra content at the bottom, e.g. a Progress towards the goal. */
  footer?: React.ReactNode;
  className?: string;
}

const COUNT_MS = 900;

/** Counts from 0 to `target` with an ease-out curve; shows the target at once when motion is reduced. */
function useCountUp(target: number | null, ref: React.RefObject<HTMLElement | null>) {
  const [shown, setShown] = React.useState(target ?? 0);
  useIsoLayoutEffect(() => {
    if (target === null) return;
    if (prefersStill(ref.current)) {
      setShown(target);
      return;
    }
    let frame = 0;
    const begin = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - begin) / COUNT_MS);
      setShown(t === 1 ? target : target * (1 - Math.pow(2, -10 * t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ref]);
  return shown;
}

/** A single KPI with its trend, for dashboards. Group several in a `div.ae-stat-group` to share one frame. */
export function StatTile({ label, value, delta, caption, icon, program, footer, className }: StatTileProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const numeric = typeof value === 'number' ? value : null;
  const shown = useCountUp(numeric, ref);
  const format = React.useMemo(() => {
    const decimals = numeric === null ? 0 : (String(numeric).split('.')[1] ?? '').length;
    return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }, [numeric]);
  const intent = delta?.intent ?? (delta?.direction === 'up' ? 'positive' : delta?.direction === 'down' ? 'negative' : 'neutral');
  const arrow: IconName = delta?.direction === 'up' ? 'arrow-up' : delta?.direction === 'down' ? 'arrow-down' : 'arrow-right';
  return (
    <div ref={ref} className={cx('ae-stat', className)} data-program={program}>
      <p className="ae-stat__label ae-label">
        {icon && <Icon name={icon} size={16} />}
        {label}
      </p>
      <p className="ae-stat__value ae-h2">
        {numeric === null ? (
          value
        ) : (
          <>
            <span aria-hidden="true">{format.format(shown)}</span>
            <span className="ae-sr-only">{format.format(numeric)}</span>
          </>
        )}
      </p>
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
