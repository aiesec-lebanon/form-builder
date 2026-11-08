"use client";

import * as React from "react";

// Cloudflare Turnstile (ADR-012). Invisible unless Cloudflare needs a click; it
// keeps a fresh token in the parent through onToken (null when expired or
// failed). Changing resetKey asks for a new token, e.g. after a rejection.

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile did not load")));
    script.onerror = () => {
      loading = null;
      reject(new Error("Turnstile did not load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

type Props = {
  siteKey: string;
  theme: "light" | "dark" | "auto";
  /** Must be stable (e.g. a state setter or useCallback), or the widget re-renders. */
  onToken: (token: string | null) => void;
  resetKey: number;
};

export function Turnstile({ siteKey, theme, onToken, resetKey }: Props) {
  const container = React.useRef<HTMLDivElement>(null);
  const widget = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widget.current = api.render(container.current, {
          sitekey: siteKey,
          action: "submit",
          appearance: "interaction-only",
          "refresh-expired": "auto",
          theme,
          size: "flexible",
          callback: (token: string) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, theme, onToken]);

  React.useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    onToken(null);
    window.turnstile?.reset(widget.current);
  }, [resetKey, onToken]);

  return <div ref={container} />;
}
