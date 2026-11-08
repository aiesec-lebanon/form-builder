"use client";

import { ArrowLeft, CircleCheck, Lock } from "lucide-react";
import * as React from "react";

import { Alert, Button, cx, Progress } from "@/components/aiesec";
import type { ClosedReason } from "@/lib/forms/availability";
import { collectsAnswer, validateAnswers } from "@/lib/forms/fields";
import { computeVisibility, visibleFields } from "@/lib/forms/logic";
import { allFields, type FormDocument } from "@/lib/forms/schema";
import { formThemeAttribute } from "@/lib/forms/theme";

import { linkify } from "./linkify";
import { Question } from "./Question";
import { notifyEmbedSubmitted, useEmbedResize } from "./useEmbedResize";

// What respondents see (spec §9): one page at a time, inline validation,
// answers kept on the device until sent, never lost on a failed send.

export type RendererMode = "live" | "embed" | "preview";

type Props = {
  doc: FormDocument;
  mode: RendererMode;
  slug?: string;
  publishedRevision?: number;
  renderToken?: string;
  /** Why the form isn't taking responses, or null when it is. */
  closedReason?: ClosedReason | null;
  transparent?: boolean;
  /** Overrides the form's colour scheme (embed ?theme=). */
  themeOverride?: "light" | "dark";
  /** Fill the viewport (standalone page), so the form's colours reach the edges. */
  fullHeight?: boolean;
};

type Status = "filling" | "sending" | "sent" | "failed" | "closed";
type Draft = { answers: Record<string, unknown>; pageIndex: number; responseId: string | null; savedAt: number };

function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

const SEND_ERRORS: Record<string, string> = {
  rate_limited: "Lots of responses are coming from your network. Wait a minute, then try again.",
  delivery_failed: "We couldn't send your response just now. Your answers are saved on this device, so you can try again.",
  invalid_token: "This page has been open for a long time. Reload it, then send again. Your answers are kept.",
  too_fast: "That was quick. Wait a moment, then send again.",
  default: "Something went wrong while sending. Your answers are saved on this device, so you can try again.",
};

const CLOSED_COPY: Record<ClosedReason, string> = {
  closed: "It's no longer accepting responses. If you think this is a mistake, contact the person who shared it.",
  expired: "It stopped accepting responses. If you think this is a mistake, contact the person who shared it.",
  full: "It has received all the responses it needs. Thanks for your interest.",
};

export function FormRenderer({ doc, mode, slug, publishedRevision, renderToken, closedReason = null, transparent = false, themeOverride, fullHeight = false }: Props) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [pageIndex, setPageIndex] = React.useState(0);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [checked, setChecked] = React.useState<Set<number>>(new Set());
  const [status, setStatus] = React.useState<Status>(closedReason ? "closed" : "filling");
  const [closedWhy, setClosedWhy] = React.useState<ClosedReason>(closedReason ?? "closed");
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [restored, setRestored] = React.useState(false);
  const [busyUploads, setBusyUploads] = React.useState<Set<string>>(new Set());
  const [honeypot, setHoneypot] = React.useState("");
  const responseIdRef = React.useRef<string | null>(null);
  const [optionOrders, setOptionOrders] = React.useState<Record<string, string[]>>({});

  const persist = mode !== "preview" && Boolean(slug);
  const draftKey = `aiesec-forms:${slug}:${publishedRevision ?? 0}`;
  // Only pages and questions visible for the current answers (conditional logic, ADR-009).
  const visibility = React.useMemo(() => computeVisibility(doc, answers), [doc, answers]);
  const pages = React.useMemo(() => doc.pages.filter((item) => visibility.pages.has(item.id)).map((item) => ({ ...item, fields: item.fields.filter((field) => visibility.fields.has(field.id)) })), [doc, visibility]);
  const currentIndex = Math.min(pageIndex, Math.max(0, pages.length - 1));
  const page = pages[currentIndex] ?? { id: "none", title: "", description: "", visibleIf: null, fields: [] };
  const isLast = currentIndex >= pages.length - 1;
  const multiPage = pages.length > 1;

  useEmbedResize(mode === "embed", rootRef);

  // Shuffle options once per visit; restore a saved draft (client only, after hydration).
  React.useEffect(() => {
    const orders: Record<string, string[]> = {};
    for (const field of allFields(doc)) {
      if ((field.type === "single_choice" || field.type === "multi_choice") && field.shuffle) orders[field.id] = shuffled(field.options.map((option) => option.id));
    }
    // Random order and the device draft only exist on the client, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptionOrders(orders);
    if (!persist) return;
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as Draft;
      if (draft && typeof draft.answers === "object" && Object.keys(draft.answers).length > 0) {
        setAnswers(draft.answers);
        setPageIndex(Math.min(draft.pageIndex ?? 0, doc.pages.length - 1));
        responseIdRef.current = draft.responseId ?? null;
        setRestored(true);
      }
    } catch {
      // Unavailable or corrupt storage: start fresh.
    }
  }, [doc, draftKey, persist]);

  const saveDraft = React.useCallback(
    (nextAnswers: Record<string, unknown>, nextPage: number) => {
      if (!persist) return;
      try {
        const draft: Draft = { answers: nextAnswers, pageIndex: nextPage, responseId: responseIdRef.current, savedAt: Date.now() };
        window.localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // Storage full or blocked: the form still works.
      }
    },
    [draftKey, persist],
  );

  const clearDraft = React.useCallback(() => {
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // Nothing to clear.
    }
  }, [draftKey]);

  const responseId = React.useCallback(() => {
    if (!responseIdRef.current) {
      responseIdRef.current = crypto.randomUUID();
      saveDraft(answers, pageIndex);
    }
    return responseIdRef.current;
  }, [answers, pageIndex, saveDraft]);

  const setAnswer = (fieldId: string, value: unknown) => {
    setAnswers((current) => {
      const next = { ...current, [fieldId]: value };
      saveDraft(next, pageIndex);
      // Once a page has been checked, re-validate as people fix things.
      if (checked.has(currentIndex)) {
        const field = page.fields.find((item) => item.id === fieldId);
        if (field) {
          const result = validateAnswers([field], next);
          setErrors((previous) => {
            const copy = { ...previous };
            if (result.ok) delete copy[fieldId];
            else copy[fieldId] = result.errors[fieldId];
            return copy;
          });
        }
      }
      return next;
    });
  };

  const focusSummary = () => requestAnimationFrame(() => summaryRef.current?.focus());

  const validatePage = (index: number): boolean => {
    const result = validateAnswers(pages[index].fields, answers);
    setChecked((current) => new Set(current).add(index));
    if (result.ok) {
      setErrors((current) => {
        const copy = { ...current };
        for (const field of pages[index].fields) delete copy[field.id];
        return copy;
      });
      return true;
    }
    setErrors((current) => ({ ...current, ...result.errors }));
    focusSummary();
    return false;
  };

  const goTo = (index: number) => {
    setPageIndex(index);
    saveDraft(answers, index);
    requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  const next = () => {
    if (validatePage(currentIndex)) goTo(currentIndex + 1);
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (status === "sending") return;
    if (busyUploads.size > 0) {
      setSendError("Wait for your files to finish uploading, then send.");
      return;
    }
    if (!validatePage(currentIndex)) return;
    // Check every page; jump to the first one with problems.
    const all = validateAnswers(visibleFields(doc, answers), answers);
    if (!all.ok) {
      setErrors(all.errors);
      const firstBad = pages.findIndex((item) => item.fields.some((field) => all.errors[field.id]));
      setChecked(new Set(pages.map((_, index) => index)));
      if (firstBad !== -1 && firstBad !== currentIndex) goTo(firstBad);
      focusSummary();
      return;
    }

    setSendError(null);
    if (mode === "preview") {
      setStatus("sent");
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch(`/api/f/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: responseId(), renderToken, answers, website: honeypot }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string; reason?: ClosedReason; fieldErrors?: Record<string, string> };
      if (response.ok) {
        clearDraft();
        setStatus("sent");
        notifyEmbedSubmitted(mode === "embed");
        if (doc.settings.redirectUrl && mode === "live") window.location.assign(doc.settings.redirectUrl);
        return;
      }
      if (response.status === 410) {
        setClosedWhy(body.reason ?? "closed");
        setStatus("closed");
        return;
      }
      if (response.status === 422 && body.fieldErrors) {
        setErrors(body.fieldErrors);
        const firstBad = pages.findIndex((item) => item.fields.some((field) => body.fieldErrors?.[field.id]));
        if (firstBad !== -1) goTo(firstBad);
        setStatus("filling");
        focusSummary();
        return;
      }
      setSendError(SEND_ERRORS[body.error ?? ""] ?? body.message ?? SEND_ERRORS.default);
      setStatus("failed");
    } catch {
      setSendError(SEND_ERRORS.default);
      setStatus("failed");
    }
  };

  const startOver = () => {
    clearDraft();
    responseIdRef.current = null;
    setAnswers({});
    setErrors({});
    setChecked(new Set());
    setPageIndex(0);
    setRestored(false);
    setSendError(null);
    setStatus("filling");
  };

  const upload = React.useMemo(
    () => ({
      mode,
      slug,
      responseId,
      onBusyChange: (fieldId: string, busy: boolean) =>
        setBusyUploads((current) => {
          const has = current.has(fieldId);
          if (busy === has) return current;
          const copy = new Set(current);
          if (busy) copy.add(fieldId);
          else copy.delete(fieldId);
          return copy;
        }),
    }),
    [mode, slug, responseId],
  );

  const pageErrors = page.fields.filter((field) => errors[field.id]);
  const themeAttribute = formThemeAttribute(doc.theme.style, themeOverride ?? doc.theme.mode);
  const questionCount = allFields(doc).filter(collectsAnswer).length;

  return (
    <div ref={rootRef} data-program={doc.theme.accent} data-theme={themeAttribute} className={cx("text-text", transparent ? "bg-transparent" : "bg-bg", fullHeight && "min-h-dvh")}>
      <div aria-hidden="true" className="h-1.5 w-full bg-accent" />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        {status === "sent" ? (
          <section aria-live="polite" className="flex flex-col items-start gap-5 py-6">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-success-soft text-success-text">
              <CircleCheck size={32} aria-hidden="true" />
            </span>
            <h1 className="ae-h2">{doc.settings.confirmationTitle || "Thanks, we got your response"}</h1>
            {doc.settings.confirmationMessage && <p className="whitespace-pre-line ae-body-lg text-text-muted">{linkify(doc.settings.confirmationMessage)}</p>}
            {mode === "preview" && <Alert tone="info">This is a preview. Nothing was sent.</Alert>}
            {doc.settings.redirectUrl && mode === "embed" && (
              <a href={doc.settings.redirectUrl} target="_top" className="ae-btn ae-btn--primary ae-body no-underline">
                Continue
              </a>
            )}
            {(doc.settings.allowAnotherResponse || mode === "preview") && (
              <Button variant="secondary" onClick={startOver}>
                Submit another response
              </Button>
            )}
          </section>
        ) : status === "closed" ? (
          <section className="flex flex-col items-start gap-4 py-6">
            <span className="inline-flex size-14 items-center justify-center rounded-full bg-fill text-text-muted">
              <Lock size={28} aria-hidden="true" />
            </span>
            <h1 className="ae-h2">{doc.title || "This form"} is closed</h1>
            <p className="ae-body-lg text-text-muted">{CLOSED_COPY[closedWhy]}</p>
          </section>
        ) : (
          <>
            <header className="flex flex-col gap-3">
              <h1 className="ae-h1 break-words">{doc.title || "Untitled form"}</h1>
              {doc.description && <p className="whitespace-pre-line ae-body-lg text-text-muted">{linkify(doc.description)}</p>}
              {restored && (
                <p className="ae-body-sm text-text-muted">
                  We kept your answers from last time.{" "}
                  <button type="button" className="ae-link cursor-pointer border-0 bg-transparent p-0" onClick={startOver}>
                    Clear form
                  </button>
                </p>
              )}
            </header>

            {multiPage && doc.settings.showProgressBar && (
              <Progress label={`Page ${currentIndex + 1} of ${pages.length}`} value={currentIndex + 1} max={pages.length} showValue valueText={`${currentIndex + 1} of ${pages.length}`} tone="accent" />
            )}

            {pageErrors.length > 0 && (
              <div ref={summaryRef} tabIndex={-1} className="outline-none">
                <Alert tone="danger" title={pageErrors.length === 1 ? "There's 1 answer to fix" : `There are ${pageErrors.length} answers to fix`} live>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {pageErrors.map((field) => (
                      <li key={field.id}>
                        <a
                          href={`#q-${field.id}`}
                          className="ae-link"
                          onClick={(event) => {
                            event.preventDefault();
                            const target = document.getElementById(`q-${field.id}`);
                            target?.scrollIntoView({ block: "center", behavior: "smooth" });
                            // React Aria controls mark their trigger; date fields focus the first segment.
                            const control = target?.querySelector<HTMLElement>("[data-focus-target], [role='spinbutton']") ?? target?.querySelector<HTMLElement>("input, textarea, select");
                            control?.focus({ preventScroll: true });
                          }}
                        >
                          {field.label || "Untitled question"}: {errors[field.id]}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Alert>
              </div>
            )}

            <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-10" aria-label={doc.title || "Form"}>
              {(page.title || page.description) && multiPage && (
                <div className="flex flex-col gap-1 border-b border-border pb-4">
                  {page.title && <h2 className="ae-h3">{page.title}</h2>}
                  {page.description && <p className="whitespace-pre-line ae-body text-text-muted">{linkify(page.description)}</p>}
                </div>
              )}
              {page.fields.map((field) => (
                <Question key={field.id} field={field} value={answers[field.id]} error={errors[field.id]} onChange={(value) => setAnswer(field.id, value)} optionOrder={optionOrders[field.id]} upload={upload} />
              ))}

              {/* Honeypot for bots; people never see or reach it. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
                </label>
              </div>

              {sendError && (
                <Alert tone="danger" title="Not sent yet" live>
                  {sendError}
                </Alert>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                {currentIndex > 0 ? (
                  <Button variant="tertiary" size="lg" iconStart={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => goTo(currentIndex - 1)}>
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                {isLast ? (
                  <Button type="submit" variant="primary" size="lg" loading={status === "sending"} className="w-full sm:w-auto">
                    {status === "failed" ? "Try again" : doc.settings.submitLabel || "Send response"}
                  </Button>
                ) : (
                  <Button variant="primary" size="lg" onClick={next} className="w-full sm:w-auto">
                    Next
                  </Button>
                )}
              </div>
            </form>

            {questionCount === 0 && <p className="ae-body text-text-muted">This form has no questions yet.</p>}
          </>
        )}

        <footer className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-border pt-6 ae-caption text-text-muted">
          <p>Never share passwords in a form.</p>
          <a href="/privacy" target="_blank" rel="noopener" className="ae-link">
            How responses are handled
          </a>
        </footer>
      </div>
    </div>
  );
}
