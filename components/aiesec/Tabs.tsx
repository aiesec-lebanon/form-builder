'use client';
import * as React from 'react';
import { useIsoLayoutEffect } from './hooks';
import { cx } from './utils';

export interface TabItem {
  /** Stable id, also the value reported by onChange. */
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
  /** Trailing count, e.g. `<Badge>12</Badge>`. */
  badge?: React.ReactNode;
}

export interface TabsProps {
  /** Names the tab list for screen readers, e.g. "Opportunity details". */
  label: string;
  items: TabItem[];
  /** Controlled selected tab id. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
}

/** Switches between sibling views of the same object. Arrow keys move between tabs, Home and End jump; the indicator slides to the selected tab. */
export function Tabs({ label, items, value, defaultValue, onChange, className }: TabsProps) {
  const baseId = React.useId();
  const [inner, setInner] = React.useState(defaultValue ?? items.find((i) => !i.disabled)?.id);
  const selected = value ?? inner;
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const [bar, setBar] = React.useState<{ x: number; w: number } | null>(null);

  useIsoLayoutEffect(() => {
    const tab = selected ? tabRefs.current.get(selected) : undefined;
    if (!tab) return;
    const measure = () => setBar({ x: tab.offsetLeft, w: tab.offsetWidth });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [selected]);

  const select = (id: string) => {
    if (value === undefined) setInner(id);
    onChange?.(id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((i) => !i.disabled);
    const index = enabled.findIndex((i) => i.id === selected);
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>;
    let next: TabItem | undefined;
    if (event.key in step) next = enabled[(index + step[event.key] + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    select(next.id);
    tabRefs.current.get(next.id)?.focus();
  };

  return (
    <div className={cx('ae-tabs', className)}>
      <div role="tablist" aria-label={label} className="ae-tabs__list" onKeyDown={onKeyDown}>
        {items.map((item) => {
          const isSelected = item.id === selected;
          return (
            <button
              key={item.id}
              ref={(el) => {
                if (el) tabRefs.current.set(item.id, el);
                else tabRefs.current.delete(item.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-controls={`${baseId}-panel-${item.id}`}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              className="ae-tab ae-label"
              onClick={() => select(item.id)}
            >
              {item.label}
              {item.badge}
            </button>
          );
        })}
        <span className="ae-tabs__indicator" aria-hidden="true" style={(bar ? { '--_x': `${bar.x}px`, '--_w': `${bar.w}px` } : { opacity: 0 }) as React.CSSProperties} />
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selected}
          tabIndex={0}
          className="ae-tabs__panel"
        >
          {item.id === selected && item.content}
        </div>
      ))}
    </div>
  );
}
