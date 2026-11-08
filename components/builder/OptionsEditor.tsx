"use client";

import { Plus, X } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";
import { OTHER_LABEL } from "@/lib/forms/fields/choice";
import { newId } from "@/lib/forms/ids";
import { LIMITS, type Option } from "@/lib/forms/schema";

// Fast list editing for options, grid rows and grid columns: Enter adds the
// next item, Backspace on an empty one removes it, pasting several lines
// creates several items, Alt+↑/↓ reorders.

type Props = {
  options: Option[];
  onOptions: (options: Option[]) => void;
  /** What sits before each item. */
  marker: "radio" | "checkbox" | "number" | "none";
  /** "Option", "Row" or "Column": used in labels and placeholders. */
  itemName?: string;
  max?: number;
  allowOther?: boolean;
  onAllowOther?: (allow: boolean) => void;
};

export function OptionsEditor({ options, onOptions, marker, itemName = "Option", max = LIMITS.options, allowOther = false, onAllowOther }: Props) {
  const inputs = React.useRef(new Map<string, HTMLInputElement>());
  // The item to focus after the next render (a ref: focusing isn't state).
  const pendingFocus = React.useRef<string | null>(null);
  const setFocusId = (id: string) => {
    pendingFocus.current = id;
  };
  const lower = itemName.toLowerCase();

  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    const input = inputs.current.get(id);
    if (input) {
      input.focus();
      input.select();
      pendingFocus.current = null;
    }
  }, [options]);

  const update = (id: string, label: string) => onOptions(options.map((option) => (option.id === id ? { ...option, label } : option)));

  const insertAfter = (index: number, labels: string[] = [""]) => {
    const room = max - options.length;
    if (room <= 0) return;
    const created = labels.slice(0, room).map((label) => ({ id: newId("o"), label }));
    onOptions([...options.slice(0, index + 1), ...created, ...options.slice(index + 1)]);
    setFocusId(created[created.length - 1].id);
  };

  const remove = (index: number) => {
    const next = options.filter((_, position) => position !== index);
    onOptions(next);
    const neighbour = next[index - 1] ?? next[index];
    if (neighbour) setFocusId(neighbour.id);
  };

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    onOptions(next);
    setFocusId(options[index].id);
  };

  const markerFor = (index: number) => {
    if (marker === "number") return <span className="w-5 shrink-0 text-right ae-body-sm text-text-muted">{index + 1}.</span>;
    if (marker === "none") return null;
    return <span aria-hidden="true" className={cx("inline-block size-4 shrink-0 border-2 border-border-strong", marker === "radio" ? "rounded-full" : "rounded-sm")} />;
  };

  return (
    <div className="flex flex-col gap-1">
      <ul role="list" className="flex flex-col gap-1">
        {options.map((option, index) => (
          <li key={option.id} className="group flex items-center gap-3">
            {markerFor(index)}
            <input
              ref={(element) => {
                if (element) inputs.current.set(option.id, element);
                else inputs.current.delete(option.id);
              }}
              value={option.label}
              aria-label={`${itemName} ${index + 1}`}
              placeholder={`${itemName} ${index + 1}`}
              maxLength={LIMITS.label}
              onChange={(event) => update(option.id, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  insertAfter(index);
                } else if (event.key === "Backspace" && option.label === "" && options.length > 1) {
                  event.preventDefault();
                  remove(index);
                } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
                  event.preventDefault();
                  move(index, event.key === "ArrowUp" ? -1 : 1);
                }
              }}
              onPaste={(event) => {
                const lines = event.clipboardData
                  .getData("text")
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                if (lines.length < 2) return;
                event.preventDefault();
                const [first, ...rest] = lines;
                const merged = options.map((item) => (item.id === option.id ? { ...item, label: option.label ? `${option.label}${first}` : first } : item));
                const room = max - merged.length;
                const created = rest.slice(0, Math.max(0, room)).map((label) => ({ id: newId("o"), label }));
                onOptions([...merged.slice(0, index + 1), ...created, ...merged.slice(index + 1)]);
                if (created.length) setFocusId(created[created.length - 1].id);
              }}
              className="h-10 min-w-0 flex-1 border-0 border-b-2 border-transparent bg-transparent px-0 ae-body text-text outline-none placeholder:text-text-muted hover:border-border focus:border-primary"
            />
            <button
              type="button"
              aria-label={`Remove ${lower} ${index + 1}`}
              disabled={options.length <= 1}
              onClick={() => remove(index)}
              className="ae-close opacity-100 disabled:invisible lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
        {allowOther && (
          <li className="flex items-center gap-3">
            {markerFor(options.length)}
            <span className="h-10 flex-1 border-b-2 border-dotted border-border pt-2 ae-body text-text-muted">{OTHER_LABEL}…</span>
            <button type="button" aria-label="Remove the Other option" onClick={() => onAllowOther?.(false)} className="ae-close">
              <X size={18} aria-hidden="true" />
            </button>
          </li>
        )}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
        <button
          type="button"
          onClick={() => insertAfter(options.length - 1)}
          disabled={options.length >= max}
          className="inline-flex h-10 items-center gap-2 rounded-md px-2 ae-label text-primary-text hover:bg-fill disabled:opacity-45"
        >
          <Plus size={18} aria-hidden="true" />
          Add {lower}
        </button>
        {onAllowOther && !allowOther && (
          <button type="button" onClick={() => onAllowOther(true)} className="inline-flex h-10 items-center rounded-md px-2 ae-body-sm text-text-muted hover:bg-fill hover:text-text">
            Add &ldquo;{OTHER_LABEL}&rdquo;
          </button>
        )}
        {itemName === "Option" && <span className="hidden ae-caption text-text-muted lg:inline">Tip: paste a list to add many at once</span>}
      </div>
    </div>
  );
}
