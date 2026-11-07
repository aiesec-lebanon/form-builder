"use client";

import { X } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";

// A bottom sheet on phones and a centred dialog from 1024px, on the native
// <dialog> (focus trapped, page inert, Esc closes). Styles: globals.css .fb-sheet.

type Props = {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Desktop width in px. */
  width?: number;
  className?: string;
};

export function Sheet({ open, onClose, title, children, footer, width = 560, className }: Props) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx("fb-sheet", className)}
      style={{ "--fb-sheet-width": `${width}px` } as React.CSSProperties}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden="true" />
        <div className="flex items-center gap-3 px-5 pt-4 pb-3">
          <h2 id={titleId} className="ae-h4 flex-1">
            {title}
          </h2>
          <button type="button" className="ae-close" aria-label="Close" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-3 border-t border-border px-5 py-4">{footer}</div>}
      </div>
    </dialog>
  );
}
