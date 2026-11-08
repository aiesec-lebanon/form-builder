"use client";

import { Plus, Search, Trash2 } from "lucide-react";
import NextLink from "next/link";
import * as React from "react";

import { Alert, Button, Modal, TextField, cx } from "@/components/aiesec";
import type { FormStatus } from "@/components/app/StatusBadge";

import { FormCard } from "./FormCard";
import { TemplatePicker } from "./TemplatePicker";

export type DashboardForm = {
  id: string;
  title: string;
  slug: string;
  status: FormStatus;
  responseCount: number;
  /** Percent of views that ended in a response; null with too few views. */
  completionRate: number | null;
  updatedAt: string;
  deletedAt: string | null;
  isOwner: boolean;
  ownerName: string;
  failing: boolean;
  /** Unread "Contact form owner" messages. */
  unreadMessages: number;
};

type Props = { forms: DashboardForm[]; view: "active" | "trash"; publicBaseUrl: string; firstName: string };

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

export function FormsDashboard({ forms, view, publicBaseUrl, firstName }: Props) {
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // "N" opens the new-form picker from anywhere on the dashboard.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "n" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target) && view === "active") {
        event.preventDefault();
        setCreating(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? forms.filter((form) => form.title.toLowerCase().includes(needle)) : forms;
  }, [forms, query]);

  const failing = view === "active" ? forms.filter((form) => form.failing) : [];
  const isEmpty = forms.length === 0;

  return (
    <div className="ae-container flex flex-col gap-8 py-8 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="ae-h2">{view === "trash" ? "Trash" : isEmpty ? `Welcome${firstName ? `, ${firstName}` : ""}` : "Your forms"}</h1>
          <p className="ae-body text-text-muted">
            {view === "trash" ? "Forms here are deleted for good after 30 days." : isEmpty ? "Pick a starting point. You can change everything later." : "Responses go straight to the destination you connect."}
          </p>
        </div>
        {view === "active" && !isEmpty && (
          <Button variant="primary" iconStart={<Plus size={20} aria-hidden="true" />} onClick={() => setCreating(true)} aria-keyshortcuts="N">
            New form
          </Button>
        )}
      </div>

      {failing.length > 0 && (
        <Alert tone="danger" title={failing.length === 1 ? "Responses aren't reaching one form's destination" : `Responses aren't reaching ${failing.length} forms' destinations`}>
          Respondents see an error and can retry, but nothing is saved until the destination works again. Open{" "}
          {failing.map((form, index) => (
            <React.Fragment key={form.id}>
              {index > 0 && ", "}
              <NextLink className="ae-link" href={`/forms/${form.id}/edit?tab=connect`}>
                {form.title}
              </NextLink>
            </React.Fragment>
          ))}{" "}
          to fix it.
        </Alert>
      )}

      {isEmpty && view === "active" ? (
        <section aria-label="Templates" className="flex flex-col gap-4">
          <TemplatePicker />
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="w-full sm:max-w-sm">
              <TextField
                label="Search forms"
                hideLabel
                type="search"
                placeholder="Search forms"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                iconStart={<Search size={20} aria-hidden="true" />}
              />
            </div>
            <nav aria-label="Form lists" className="flex items-center gap-1">
              <ViewLink href="/forms" current={view === "active"}>
                Forms
              </ViewLink>
              <ViewLink href="/forms?view=trash" current={view === "trash"} icon={<Trash2 size={16} aria-hidden="true" />}>
                Trash
              </ViewLink>
            </nav>
          </div>

          {visible.length > 0 ? (
            <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((form) => (
                <li key={form.id}>
                  <FormCard form={form} publicBaseUrl={publicBaseUrl} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong p-8">
              {forms.length === 0 ? (
                <>
                  <p className="ae-h4">Trash is empty</p>
                  <p className="ae-body text-text-muted">Forms you move to the trash appear here for 30 days.</p>
                </>
              ) : (
                <>
                  <p className="ae-h4">No forms match &ldquo;{query}&rdquo;</p>
                  <Button variant="tertiary" onClick={() => setQuery("")}>
                    Clear search
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Create a form" size="lg">
        <div className="flex flex-col gap-4 pb-2">
          <p className="ae-body-sm text-text-muted">Start blank or from a template. Everything stays editable.</p>
          {creating && <TemplatePicker autoFocusBlank />}
        </div>
      </Modal>
    </div>
  );
}

function ViewLink({ href, current, icon, children }: { href: string; current: boolean; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <NextLink
      href={href}
      aria-current={current ? "page" : undefined}
      className={cx(
        "inline-flex h-10 items-center gap-2 rounded-md px-3 ae-label no-underline",
        current ? "bg-surface text-text shadow-[var(--ae-shadow-xs),inset_0_0_0_1px_var(--ae-border)]" : "text-text-muted hover:bg-fill hover:text-text",
      )}
    >
      {icon}
      {children}
    </NextLink>
  );
}
