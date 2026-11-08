'use client';
import * as React from 'react';
import { endOfMonth, endOfYear, isSameMonth, isSameYear, startOfMonth, startOfYear, today, type CalendarDate, type DateValue } from '@internationalized/date';
import { useDateFormatter } from 'react-aria';
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  CalendarStateContext,
  ListBox,
  ListBoxItem,
  useLocale,
} from 'react-aria-components';
import { prefersStill, useIsoLayoutEffect } from './hooks';
import { Icon } from './icons';

type View = 'days' | 'months' | 'years';
const DEPTH: Record<View, number> = { days: 0, months: 1, years: 2 };
const YEARS_PER_PAGE = 20;

interface Pick {
  id: string;
  date: CalendarDate;
  label: string;
  disabled: boolean;
  today: boolean;
}

/** Slides the current view in from the side it came from when its page (month, year or page of years) changes. */
function usePageSlide(ref: React.RefObject<HTMLElement | null>, view: View, page: CalendarDate, rtl: boolean) {
  const last = React.useRef({ view, page });
  const key = `${view}:${page.toString()}`;
  useIsoLayoutEffect(() => {
    const prev = last.current;
    last.current = { view, page };
    const el = ref.current;
    if (prev.view !== view || !el?.animate || prefersStill(el)) return;
    const css = getComputedStyle(el);
    const duration = parseFloat(css.getPropertyValue('--ae-duration-base'));
    const sign = Math.sign(page.compare(prev.page));
    if (!duration || !sign) return;
    const dx = sign * (rtl ? -1 : 1) * 24;
    el.animate([{ transform: `translateX(${dx}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration, easing: css.getPropertyValue('--ae-ease-out').trim() || 'ease-out' });
  }, [key]);
}

/** A grid of months or years; choosing the current item again (or Escape) also counts as choosing it, and zooms back in. */
function PickGrid({ label, items, current, onPick }: { label: string; items: Pick[]; current?: string; onPick: (item: Pick) => void }) {
  const pick = (id?: string) => {
    const item = items.find((it) => it.id === (id ?? current));
    if (item) onPick(item);
  };
  return (
    <ListBox
      aria-label={label}
      layout="grid"
      items={items}
      selectionMode="single"
      shouldSelectOnPressUp
      selectedKeys={current ? [current] : []}
      onSelectionChange={(keys) => pick(keys === 'all' ? undefined : (keys.values().next().value as string | undefined))}
      disabledKeys={items.filter((it) => it.disabled).map((it) => it.id)}
      autoFocus
      className="ae-calendar__picks"
    >
      {(item) => (
        <ListBoxItem id={item.id} textValue={item.label} className="ae-calendar__pick ae-body" data-today={item.today || undefined}>
          {item.label}
        </ListBoxItem>
      )}
    </ListBox>
  );
}

/** Internal: the calendar views DatePicker and Calendar share. The month and year in the header zoom out to that year's months and to a grid of years. */
export function CalendarViews() {
  const state = React.useContext(CalendarStateContext)!;
  const { direction } = useLocale();
  const [view, setView] = React.useState<View>('days');
  const [zoom, setZoom] = React.useState<'in' | 'out'>();
  const viewRef = React.useRef<HTMLDivElement>(null);

  const focused = state.focusedDate;
  const tz = state.timeZone;
  const calendar = focused.calendar.identifier;
  const monthLong = useDateFormatter({ month: 'long', calendar, timeZone: tz });
  const monthShort = useDateFormatter({ month: 'short', calendar, timeZone: tz });
  const yearFormat = useDateFormatter({ year: 'numeric', calendar, timeZone: tz });
  const now = today(tz);
  const outside = (start: DateValue, end: DateValue) =>
    (state.maxValue != null && start.compare(state.maxValue) > 0) || (state.minValue != null && end.compare(state.minValue) < 0);

  const pageStart = focused.subtract({ years: focused.year % YEARS_PER_PAGE });
  usePageSlide(viewRef, view, view === 'days' ? startOfMonth(focused) : view === 'months' ? startOfYear(focused) : startOfYear(pageStart), direction === 'rtl');

  const go = (next: View) => {
    setZoom(DEPTH[next] > DEPTH[view] ? 'out' : 'in');
    if (next === 'days') state.setFocused(true);
    setView(next);
  };
  const toggle = (target: View) => go(view === target ? 'days' : target);

  const months: Pick[] = Array.from({ length: focused.calendar.getMonthsInYear(focused) }, (_, i) => {
    const date = focused.set({ month: i + 1 });
    return { id: date.toString(), date, label: monthShort.format(date.toDate(tz)), disabled: outside(startOfMonth(date), endOfMonth(date)), today: isSameMonth(date, now) };
  });
  const years: Pick[] = Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
    const date = pageStart.add({ years: i });
    return { id: date.toString(), date, label: yearFormat.format(date.toDate(tz)), disabled: outside(startOfYear(date), endOfYear(date)), today: isSameYear(date, now) };
  });

  // In the months view the arrows step a year, in the years view a page of years.
  const step = view === 'months' ? 1 : YEARS_PER_PAGE;
  const stepDisabled = (sign: number) => {
    const from = (view === 'months' ? focused : pageStart).add({ years: sign * step });
    return outside(startOfYear(from), endOfYear(view === 'months' ? from : from.add({ years: YEARS_PER_PAGE - 1 })));
  };
  const unit = view === 'months' ? 'year' : `${YEARS_PER_PAGE} years`;

  const monthLabel = monthLong.format(focused.toDate(tz));
  const yearLabel = yearFormat.format(focused.toDate(tz));
  return (
    <>
      <header className="ae-calendar__header">
        <div className="ae-calendar__titles">
          <Button slot={null} className="ae-calendar__title ae-label" aria-label={`${monthLabel}, choose month`} aria-pressed={view === 'months'} onPress={() => toggle('months')}>
            {monthLabel}
            <Icon name="chevron-down" size={16} />
          </Button>
          <Button slot={null} className="ae-calendar__title ae-label" aria-label={`${yearLabel}, choose year`} aria-pressed={view === 'years'} onPress={() => toggle('years')}>
            {yearLabel}
            <Icon name="chevron-down" size={16} />
          </Button>
        </div>
        <div className="ae-calendar__navs">
          {view === 'days' ? (
            <>
              <Button slot="previous" className="ae-calendar__nav">
                <Icon name="chevron-left" size={20} className="ae-icon--flip" />
              </Button>
              <Button slot="next" className="ae-calendar__nav">
                <Icon name="chevron-right" size={20} className="ae-icon--flip" />
              </Button>
            </>
          ) : (
            <>
              <Button slot={null} className="ae-calendar__nav" aria-label={`Previous ${unit}`} isDisabled={stepDisabled(-1)} onPress={() => state.setFocusedDate(focused.subtract({ years: step }))}>
                <Icon name="chevron-left" size={20} className="ae-icon--flip" />
              </Button>
              <Button slot={null} className="ae-calendar__nav" aria-label={`Next ${unit}`} isDisabled={stepDisabled(1)} onPress={() => state.setFocusedDate(focused.add({ years: step }))}>
                <Icon name="chevron-right" size={20} className="ae-icon--flip" />
              </Button>
            </>
          )}
        </div>
      </header>
      <div className="ae-calendar__body">
        <div key={view} ref={viewRef} className="ae-calendar__view" data-view={view} data-zoom={zoom}>
          {view === 'days' ? (
            <CalendarGrid className="ae-calendar__grid">
              <CalendarGridHeader>{(day) => <CalendarHeaderCell className="ae-calendar__weekday ae-caption">{day}</CalendarHeaderCell>}</CalendarGridHeader>
              <CalendarGridBody>{(date) => <CalendarCell date={date} className="ae-calendar__cell ae-body-sm" />}</CalendarGridBody>
            </CalendarGrid>
          ) : view === 'months' ? (
            <PickGrid
              label={`Months, ${yearLabel}`}
              items={months}
              current={months.find((m) => isSameMonth(m.date, focused))?.id}
              onPick={(m) => {
                state.setFocusedDate(m.date);
                go('days');
              }}
            />
          ) : (
            <PickGrid
              label={`Years, ${years[0].label} to ${years[YEARS_PER_PAGE - 1].label}`}
              items={years}
              current={years.find((y) => isSameYear(y.date, focused))?.id}
              onPick={(y) => {
                state.setFocusedDate(y.date);
                go('months');
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
