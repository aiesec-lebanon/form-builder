"use client";

import * as React from "react";

/** In an iframe, tells the host page our height so embed.js can size the frame. */
export function useEmbedResize(enabled: boolean, ref: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    if (!enabled || window.parent === window || !ref.current) return;
    let last = 0;
    const post = () => {
      const height = Math.ceil(ref.current?.getBoundingClientRect().height ?? 0);
      if (height && height !== last) {
        last = height;
        // The height is not sensitive; any embedding page may read it.
        window.parent.postMessage({ type: "aiesec-forms:resize", height }, "*");
      }
    };
    const observer = new ResizeObserver(post);
    observer.observe(ref.current);
    post();
    return () => observer.disconnect();
  }, [enabled, ref]);
}

export function notifyEmbedSubmitted(enabled: boolean) {
  if (enabled && window.parent !== window) window.parent.postMessage({ type: "aiesec-forms:submitted" }, "*");
}
