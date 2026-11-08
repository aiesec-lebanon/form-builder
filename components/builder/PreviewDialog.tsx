"use client";

import { Monitor, Smartphone, X } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";
import { FormRenderer } from "@/components/form/FormRenderer";
import type { FormDocument } from "@/lib/forms/schema";

// Full-screen preview with a phone/desktop switch. Same renderer as the live
// form, in preview mode: validation works, nothing is sent.

export function PreviewDialog({ open, onClose, doc }: { open: boolean; onClose: () => void; doc: FormDocument }) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const [device, setDevice] = React.useState<"phone" | "desktop">("desktop");
  const [session, setSession] = React.useState(0);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setSession((value) => value + 1);
      setDevice(window.innerWidth < 1024 ? "phone" : "desktop");
      dialog.showModal();
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

  const segment = (value: "phone" | "desktop", label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-pressed={device === value}
      onClick={() => setDevice(value)}
      className={cx("inline-flex h-9 items-center gap-2 rounded-md px-3 ae-label", device === value ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text")}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <dialog ref={ref} aria-label="Preview" className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-bg-subtle p-0 text-text backdrop:bg-scrim dark:bg-bg">
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-bg px-4">
          <p className="ae-label">Preview</p>
          <div className="hidden items-center gap-1 rounded-md bg-fill p-1 sm:flex" role="group" aria-label="Device">
            {segment("phone", "Phone", <Smartphone size={16} aria-hidden="true" />)}
            {segment("desktop", "Desktop", <Monitor size={16} aria-hidden="true" />)}
          </div>
          <button type="button" className="ae-btn ae-btn--secondary ae-body" onClick={onClose}>
            <X size={18} aria-hidden="true" />
            Close preview
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-0 sm:p-6">
          <div
            className={cx(
              "mx-auto overflow-hidden bg-bg transition-[max-width] duration-300",
              device === "phone" ? "max-w-[390px] sm:min-h-[760px] sm:rounded-xl sm:border sm:border-border sm:shadow-lg" : "max-w-5xl sm:rounded-lg sm:border sm:border-border",
            )}
          >
            {open && <FormRenderer key={session} doc={doc} mode="preview" />}
          </div>
        </div>
      </div>
    </dialog>
  );
}
