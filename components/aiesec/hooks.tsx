'use client';
import * as React from 'react';
import { UNSAFE_PortalProvider } from 'react-aria';

/** Internal: layout effect in the browser, plain effect on the server (no SSR warning). */
export const useIsoLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

/** Internal: the nearest ancestor that sets `data-theme` (other than <html>), so overlays opened inside a themed region keep its theme. */
export function useThemeScope<T extends HTMLElement>(): [React.RefObject<T | null>, HTMLElement | null] {
  const ref = React.useRef<T>(null);
  const [scope, setScope] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    const el = ref.current?.parentElement?.closest<HTMLElement>('[data-theme]') ?? null;
    setScope(el === document.documentElement ? null : el);
  }, []);
  return [ref, scope];
}

/** Internal: renders overlays (select lists, calendars) into the themed region found by useThemeScope. */
export function ThemePortal({ scope, children }: { scope: HTMLElement | null; children: React.ReactNode }) {
  return scope ? <UNSAFE_PortalProvider getContainer={() => scope}>{children}</UNSAFE_PortalProvider> : <>{children}</>;
}

/** Internal: whether motion should be kept to state changes (reduced-motion setting or `data-motion="subtle"`). */
export function prefersStill(el: Element | null): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!el?.closest('[data-motion="subtle"]');
}
