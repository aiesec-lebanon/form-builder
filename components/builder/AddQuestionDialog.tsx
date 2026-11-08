"use client";

import { FilePlus2, Search } from "lucide-react";
import * as React from "react";

import { definitionOf, PALETTE } from "@/lib/forms/fields";
import type { FieldType } from "@/lib/forms/schema";

import { FIELD_ICONS } from "./fieldIcons";
import { Sheet } from "./Sheet";

// Quick add: type to filter, Enter inserts the first match. Used by "/", the
// mobile add button and each page's "Add question".

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (type: FieldType) => void;
  onAddPage: () => void;
};

export function AddQuestionDialog({ open, onClose, onPick, onAddPage }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Add a question" width={640}>
      {/* Mounted per opening, so the search starts empty every time. */}
      {open && <AddQuestionBody onPick={onPick} onAddPage={onAddPage} />}
    </Sheet>
  );
}

function AddQuestionBody({ onPick, onAddPage }: Omit<Props, "open" | "onClose">) {
  const [query, setQuery] = React.useState("");
  // Don't pop the keyboard over the list on phones.
  const [touch] = React.useState(() => window.matchMedia("(pointer: coarse)").matches);

  const needle = query.trim().toLowerCase();
  const groups = PALETTE.map((group) => ({
    ...group,
    types: group.types.filter((type) => {
      if (!needle) return true;
      const definition = definitionOf(type);
      return `${definition.name} ${definition.hint} ${type.replace(/_/g, " ")}`.toLowerCase().includes(needle);
    }),
  })).filter((group) => group.types.length > 0);
  const first = groups[0]?.types[0];

  return (
    <div className="flex flex-col gap-5">
      <label className="flex h-12 items-center gap-3 rounded-md border border-border-strong bg-surface px-3 focus-within:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
        <Search size={20} aria-hidden="true" className="text-text-muted" />
        <span className="sr-only">Find a question type</span>
        <input
          value={query}
          data-autofocus={touch ? undefined : true}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && first) {
              event.preventDefault();
              onPick(first);
            }
          }}
          placeholder="Find a question type, like email or rating"
          className="h-full min-w-0 flex-1 border-0 bg-transparent ae-body text-text outline-none placeholder:text-text-muted"
        />
      </label>

      {groups.length === 0 ? (
        <p className="ae-body text-text-muted">No question type matches &ldquo;{query}&rdquo;.</p>
      ) : (
        groups.map((group) => (
          <section key={group.group} aria-label={group.title} className="flex flex-col gap-2">
            <h3 className="ae-label-sm text-text-muted uppercase">{group.title}</h3>
            <ul role="list" className="grid gap-2 sm:grid-cols-2">
              {group.types.map((type) => {
                const definition = definitionOf(type);
                const Icon = FIELD_ICONS[type];
                return (
                  <li key={type}>
                    <button
                      type="button"
                      onClick={() => onPick(type)}
                      className="flex w-full items-center gap-3 rounded-md border border-border bg-surface p-3 text-left hover:border-border-strong hover:bg-fill"
                    >
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-fill text-text">
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="ae-label text-text">{definition.name}</span>
                        <span className="truncate ae-caption text-text-muted">{definition.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {!needle && (
        <button type="button" onClick={onAddPage} className="flex items-center gap-3 rounded-md border border-dashed border-border-strong p-3 text-left hover:bg-fill">
          <FilePlus2 size={18} aria-hidden="true" className="text-text-muted" />
          <span className="flex flex-col">
            <span className="ae-label text-text">New page</span>
            <span className="ae-caption text-text-muted">Split long forms into steps</span>
          </span>
        </button>
      )}
    </div>
  );
}
