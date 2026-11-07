"use client";

import { FilePlus2 } from "lucide-react";

import { definitionOf, PALETTE } from "@/lib/forms/fields";
import type { FieldType } from "@/lib/forms/schema";

import { FIELD_ICONS } from "./fieldIcons";

/** Always-visible question types on desktop. Click inserts after the selected question. */
export function Palette({ onPick, onAddPage }: { onPick: (type: FieldType) => void; onAddPage: () => void }) {
  return (
    <nav aria-label="Add a question" className="flex flex-col gap-6 p-4">
      {PALETTE.map((group) => (
        <div key={group.group} className="flex flex-col gap-1">
          <h3 className="px-2 pb-1 ae-label-sm text-text-muted uppercase">{group.title}</h3>
          {group.types.map((type) => {
            const Icon = FIELD_ICONS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => onPick(type)}
                className="flex h-10 items-center gap-3 rounded-md px-2 text-left ae-body-sm text-text hover:bg-bg-subtle"
              >
                <Icon size={18} aria-hidden="true" className="text-text-muted" />
                {definitionOf(type).name}
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <button type="button" onClick={onAddPage} className="flex h-10 items-center gap-3 rounded-md px-2 text-left ae-body-sm text-text hover:bg-bg-subtle">
          <FilePlus2 size={18} aria-hidden="true" className="text-text-muted" />
          New page
        </button>
        <p className="px-2 pt-2 ae-caption text-text-muted">
          Press <kbd className="rounded-sm border border-border px-1 font-sans">/</kbd> to add a question from anywhere.
        </p>
      </div>
    </nav>
  );
}
