"use client";

import * as React from "react";

import { cx } from "@/components/aiesec";

// Borderless, auto-growing text for editing titles, labels and descriptions in
// place. Single-line mode wraps long text but never inserts line breaks.

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  className?: string;
  onEnter?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onFocus?: () => void;
};

export const InlineText = React.forwardRef<HTMLTextAreaElement, Props>(function InlineText(
  { value, onChange, label, placeholder, multiline = false, maxLength, autoFocus, className, onEnter, onKeyDown, onPaste, onFocus },
  forwardedRef,
) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current as HTMLTextAreaElement);

  // Grow to fit the content (field-sizing isn't in every browser yet).
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  React.useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const element = ref.current;
    element.focus({ preventScroll: false });
    element.setSelectionRange(element.value.length, element.value.length);
  }, [autoFocus]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={label}
      placeholder={placeholder}
      maxLength={maxLength}
      spellCheck
      onFocus={onFocus}
      onPaste={onPaste}
      onChange={(event) => onChange(multiline ? event.target.value : event.target.value.replace(/[\r\n]+/g, " "))}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter") {
          event.preventDefault();
          onEnter?.();
        }
        onKeyDown?.(event);
      }}
      className={cx(
        "block w-full resize-none overflow-hidden border-0 border-b-2 border-transparent bg-transparent p-0 pb-1 text-text outline-none transition-colors duration-150",
        "placeholder:text-text-muted hover:border-border focus:border-primary",
        className,
      )}
    />
  );
});
