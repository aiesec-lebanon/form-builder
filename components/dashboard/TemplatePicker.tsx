"use client";

import { CalendarCheck, FilePlus2, Mail, MessageSquareHeart, UserPlus } from "lucide-react";
import * as React from "react";

import { cx, Spinner, useToast } from "@/components/aiesec";
import { createForm } from "@/actions/forms";
import { TEMPLATES, type TemplateId } from "@/lib/forms/templates";

const ICONS: Record<TemplateId, React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  blank: FilePlus2,
  event: CalendarCheck,
  feedback: MessageSquareHeart,
  contact: Mail,
  membership: UserPlus,
};

/** One click (or Enter on the focused Blank card) creates a form and opens the builder. */
export function TemplatePicker({ autoFocusBlank = false }: { autoFocusBlank?: boolean }) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [chosen, setChosen] = React.useState<TemplateId | null>(null);

  const create = (id: TemplateId) => {
    setChosen(id);
    startTransition(async () => {
      const result = await createForm(id);
      // On success the action redirects; we only get here on failure.
      if (result && !result.ok) {
        toast.show({ tone: "danger", title: "Couldn't create the form", description: result.error });
        setChosen(null);
      }
    });
  };

  return (
    <ul role="list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.map((template) => {
        const Icon = ICONS[template.id];
        const busy = pending && chosen === template.id;
        return (
          <li key={template.id}>
            <button
              type="button"
              data-autofocus={autoFocusBlank && template.id === "blank" ? true : undefined}
              disabled={pending}
              aria-busy={busy || undefined}
              onClick={() => create(template.id)}
              className={cx(
                "group flex h-full w-full items-start gap-4 rounded-lg border p-4 text-left transition-colors duration-150",
                "border-border bg-surface hover:border-border-strong hover:bg-fill",
                pending && !busy && "opacity-45",
              )}
            >
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-fill text-text group-hover:bg-surface">
                {busy ? <Spinner size="sm" label="Creating form" /> : <Icon size={20} aria-hidden />}
              </span>
              <span className="flex flex-col gap-1">
                <span className="ae-label text-text">{template.name}</span>
                <span className="ae-body-sm text-text-muted">{template.description}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
