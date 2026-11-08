"use client";

import * as React from "react";

/**
 * The design system's sliding tab indicator for tab lists we lay out ourselves
 * (its Tabs component also renders the panels). Put `indicatorRef` on a
 * `.ae-tabs__indicator` inside a positioned tab list and `register(id)` on each
 * tab. The bar is moved with CSS variables, without re-rendering, and its first
 * placement doesn't animate.
 */
export function useTabIndicator(selected: string) {
  const tabs = React.useRef(new Map<string, HTMLElement>());
  const indicatorRef = React.useRef<HTMLSpanElement>(null);
  const placed = React.useRef(false);

  React.useLayoutEffect(() => {
    const tab = tabs.current.get(selected);
    const bar = indicatorRef.current;
    if (!tab || !bar) return;
    const place = () => {
      bar.style.setProperty("--_x", `${tab.offsetLeft}px`);
      bar.style.setProperty("--_w", `${tab.offsetWidth}px`);
    };
    if (placed.current) {
      place();
    } else {
      bar.style.transition = "none";
      place();
      void bar.offsetWidth; // commit the position before transitions come back
      bar.style.transition = "";
      placed.current = true;
    }
    // Tabs change size when the layout reflows (labels, breakpoints).
    const observer = new ResizeObserver(place);
    observer.observe(tab);
    if (tab.parentElement) observer.observe(tab.parentElement);
    return () => observer.disconnect();
  }, [selected]);

  const register = React.useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) tabs.current.set(id, element);
      else tabs.current.delete(id);
    },
    [],
  );

  return { register, indicatorRef };
}
