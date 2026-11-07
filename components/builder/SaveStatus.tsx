import { Check, CircleAlert, CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";

import { cx } from "@/components/aiesec";

import type { SaveStatus as Status } from "./useAutosave";

const COPY: Record<Status, { text: string; short: string }> = {
  saved: { text: "Saved", short: "Saved" },
  unsaved: { text: "Unsaved changes", short: "Unsaved" },
  saving: { text: "Saving…", short: "Saving" },
  offline: { text: "Offline. Changes kept on this device", short: "Offline" },
  conflict: { text: "Changed somewhere else", short: "Conflict" },
  error: { text: "Not saved", short: "Not saved" },
};

export function SaveStatus({ status, compact = false }: { status: Status; compact?: boolean }) {
  const danger = status === "conflict" || status === "error";
  const icon =
    status === "saved" ? (
      <Check size={16} aria-hidden="true" />
    ) : status === "saving" ? (
      <LoaderCircle size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
    ) : status === "offline" ? (
      <CloudOff size={16} aria-hidden="true" />
    ) : danger ? (
      status === "conflict" ? <TriangleAlert size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />
    ) : (
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-warning" />
    );
  return (
    <span role="status" aria-live="polite" className={cx("inline-flex items-center gap-1.5 whitespace-nowrap ae-caption", danger ? "font-bold text-danger-text" : "text-text-muted")}>
      {icon}
      <span className={compact ? "sr-only" : undefined}>{COPY[status].text}</span>
    </span>
  );
}
