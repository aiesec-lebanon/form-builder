"use client";

import * as React from "react";

import { useToast } from "@/components/aiesec";

/** Confirms a sign-out with a toast, then drops ?signedOut=1 so a reload doesn't repeat it. */
export function SignedOutToast() {
  const toast = useToast();
  const shown = React.useRef(false);

  React.useEffect(() => {
    // Refs survive Strict Mode's second effect run, so the toast appears once.
    if (shown.current) return;
    shown.current = true;
    toast.show({ title: "You're signed out", description: "See you next time." });
    const url = new URL(window.location.href);
    url.searchParams.delete("signedOut");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [toast]);

  return null;
}
