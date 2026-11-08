"use client";

import { Check } from "lucide-react";
import NextLink from "next/link";
import * as React from "react";
import { createPortal } from "react-dom";

import { cx } from "@/components/aiesec";

// An accessible action menu (WAI-ARIA menu button): Arrow keys move, Home/End
// jump, Esc closes and returns focus, Tab and outside clicks close. Rendered
// in a portal so cards and overflow never clip it.

export type MenuItem =
  | {
      kind?: "item";
      label: string;
      icon?: React.ReactNode;
      onSelect?: () => void;
      href?: string;
      tone?: "danger";
      disabled?: boolean;
      /** Makes it a menuitemradio with this checked state. */
      checked?: boolean;
      /** The page you're on (links): marked for sight and screen readers. */
      current?: boolean;
    }
  | { kind: "separator" }
  | { kind: "label"; content: React.ReactNode };

type MenuProps = {
  /** Accessible name of the trigger button. */
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  items: MenuItem[];
  align?: "start" | "end";
  minWidth?: number;
  /** Tooltip for the trigger (icon-only triggers). */
  title?: string;
  /** Open below this ancestor of the trigger (e.g. "header"), so the menu never overlaps it. */
  anchor?: string;
  /** Space between the trigger (or anchor) and the menu, in px. */
  gap?: number;
};

type Position = { top: number; left: number; placement: "below" | "above" };

export function Menu({ label, trigger, triggerClassName, items, align = "end", minWidth = 208, title, anchor, gap = 4 }: MenuProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<Position | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  // Opened by mouse or touch: no item is focused (so none looks selected). By keyboard: focus moves into the list.
  const openedBy = React.useRef<"pointer" | "keyboard">("keyboard");

  const focusables = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);

  const place = React.useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const bottom = Math.max(rect.bottom, (anchor ? trigger.closest(anchor)?.getBoundingClientRect().bottom : undefined) ?? rect.bottom);
    const menuHeight = menu?.offsetHeight ?? 0;
    const menuWidth = Math.max(menu?.offsetWidth ?? minWidth, minWidth);
    const spaceBelow = window.innerHeight - bottom;
    const placement = spaceBelow < menuHeight + 12 && rect.top > menuHeight + 12 ? "above" : "below";
    const top = placement === "below" ? bottom + gap : rect.top - menuHeight - gap;
    const rawLeft = align === "end" ? rect.right - menuWidth : rect.left;
    const left = Math.min(Math.max(8, rawLeft), window.innerWidth - menuWidth - 8);
    setPosition({ top, left, placement });
  }, [align, minWidth, anchor, gap]);

  const close = React.useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    if (openedBy.current === "pointer") menuRef.current?.focus();
    else (focusables().find((item) => item.getAttribute("aria-current") === "page") ?? focusables()[0])?.focus();
    // Measure again once the menu has its real size.
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    const onReposition = () => place();
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, close, place]);

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const list = focusables();
    const index = list.indexOf(document.activeElement as HTMLElement);
    const move = (next: number) => {
      event.preventDefault();
      list[(next + list.length) % list.length]?.focus();
    };
    if (event.key === "ArrowDown") move(index + 1);
    else if (event.key === "ArrowUp") move(index - 1);
    else if (event.key === "Home") move(0);
    else if (event.key === "End") move(list.length - 1);
    else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") close(false);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openedBy.current = "keyboard";
      setOpen(true);
    }
  };

  const itemClass = (tone?: "danger", disabled?: boolean, current?: boolean) =>
    cx(
      "flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left ae-body-sm no-underline outline-none",
      tone === "danger" ? "text-danger-text" : current ? "font-bold text-primary-text" : "text-text",
      disabled ? "cursor-not-allowed opacity-45" : tone === "danger" ? "cursor-pointer hover:bg-danger-soft focus:bg-danger-soft" : "cursor-pointer hover:bg-fill focus:bg-fill",
    );

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onMenuKeyDown}
      style={{ position: "fixed", top: position?.top ?? -9999, left: position?.left ?? -9999, minWidth, zIndex: 1000 }}
      className="flex flex-col gap-0.5 rounded-md border border-border bg-surface-raised p-1 shadow-md outline-none"
    >
      {items.map((item, index) => {
        if (item.kind === "separator") return <div key={index} role="separator" className="my-1 h-px bg-border" />;
        if (item.kind === "label") return <div key={index} className="px-3 pt-2 pb-1">{item.content}</div>;
        const role = item.checked === undefined ? "menuitem" : "menuitemradio";
        const content = (
          <>
            {item.icon && <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden="true">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.checked && <Check size={16} aria-hidden="true" className="text-primary-text" />}
          </>
        );
        if (item.href && !item.disabled) {
          return (
            <NextLink key={index} href={item.href} role={role} aria-checked={item.checked} aria-current={item.current ? "page" : undefined} tabIndex={-1} className={itemClass(item.tone, false, item.current)} onClick={() => close(false)}>
              {content}
            </NextLink>
          );
        }
        return (
          <button
            key={index}
            type="button"
            role={role}
            aria-checked={item.checked}
            aria-disabled={item.disabled || undefined}
            tabIndex={-1}
            className={itemClass(item.tone, item.disabled)}
            onClick={() => {
              if (item.disabled) return;
              close();
              item.onSelect?.();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={triggerClassName ?? "ae-btn ae-btn--ghost ae-btn--icon"}
        onClick={(event) => {
          // detail is 0 when Enter or Space "clicked" the button.
          openedBy.current = event.detail > 0 ? "pointer" : "keyboard";
          setOpen((value) => !value);
        }}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
