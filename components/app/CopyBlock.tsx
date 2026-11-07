"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";

/** Code or a secret with a copy button. */
export function CopyBlock({ value, label, className, wrap = false }: { value: string; label: string; className?: string; wrap?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={cx("relative", className)}>
      <pre aria-label={label} className={cx("m-0 max-h-72 overflow-auto rounded-md border border-border bg-bg-subtle p-3 pr-12 ae-code text-text", wrap ? "break-all whitespace-pre-wrap" : "whitespace-pre")}>
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        className="absolute top-2 right-2 inline-flex size-8 items-center justify-center rounded-md bg-surface text-text-muted shadow-sm hover:text-text"
      >
        {copied ? <Check size={16} aria-hidden="true" className="text-success-text" /> : <Copy size={16} aria-hidden="true" />}
      </button>
    </div>
  );
}
