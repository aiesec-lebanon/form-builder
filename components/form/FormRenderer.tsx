"use client";

import { ArrowLeft, CircleCheck, Lock } from "lucide-react";
import * as React from "react";

import { Alert, Button, cx, Modal, Progress, RequiredNote } from "@/components/aiesec";
import type { ClosedReason } from "@/lib/forms/availability";
import { collectsAnswer, validateAnswers } from "@/lib/forms/fields";
import { computeVisibility, visibleFields } from "@/lib/forms/logic";
import { questionNumbers } from "@/lib/forms/numbering";
import { allFields, type FormDocument } from "@/lib/forms/schema";
import { formThemeAttribute } from "@/lib/forms/theme";

import { FormFooter } from "./FormFooter";
import { linkify } from "./linkify";
import { NotYou } from "./NotYou";
import { Question } from "./Question";
import { Turnstile } from "./Turnstile";
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
  /** Cloudflare Turnstile site key when the bot check is on (ADR-012). */
  turnstileSiteKey?: string | null;
  /** Who is answering an AIESEC-only form (ADR-013). */
  respondent?: { name: string; email: string | null; canSwitch: boolean; recorded: boolean } | null;
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
  bot_check: "We need to check you're not a bot. Complete the check above the button, then send again.",
  sign_in_required: "Your AIESEC sign-in has ended. Reload the page to sign in again. Your answers are kept.",
  members_only: "This form is for current AIESEC members.",
  already_responded: "You've already responded to this form.",
  default: "Something went wrong while sending. Your answers are saved on this device, so you can try again.",
};

const CLOSED_COPY: Record<ClosedReason, string> = {
  closed: "It's no longer accepting responses. If you think this is a mistake, contact the person who shared it.",
  expired: "It stopped accepting responses. If you think this is a mistake, contact the person who shared it.",
  full: "It has received all the responses it needs. Thanks for your interest.",
};

export function FormRenderer({ doc, mode, slug, publishedRevision, renderToken, closedReason = null, transparent = false, themeOverride, fullHeight = false, turnstileSiteKey = null, respondent = null }: Props) {
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
  const [confirmClear, setConfirmClear] = React.useState(false);
  // Bot check: the latest token, and a waiter for a submit that comes before the first token.
  const botCheck = Boolean(turnstileSiteKey) && mode !== "preview";
  const turnstileToken = React.useRef<string | null>(null);
  const tokenWaiter = React.useRef<((token: string) => void) | null>(null);
  const [turnstileReset, setTurnstileReset] = React.useState(0);
  const onTurnstileToken = React.useCallback((token: string | null) => {
    turnstileToken.current = token;
    if (token && tokenWaiter.current) {
      tokenWaiter.current(token);
      tokenWaiter.current = null;
    }
  }, []);
  const waitForTurnstile = (ms: number) =>
    new Promise<string | null>((resolve) => {
      if (turnstileToken.current) return resolve(turnstileToken.current);
      const timer = setTimeout(() => {
        tokenWaiter.current = null;
        resolve(null);
      }, ms);
      tokenWaiter.current = (token) => {
        clearTimeout(timer);
        resolve(token);
      };
    });
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
  // Numbered in the order people meet them, skipping questions logic hides, so there are no gaps.
  const numbers = React.useMemo(() => (doc.settings.numberQuestions ? questionNumbers(pages.flatMap((item) => item.fields)) : new Map<string, number>()), [pages, doc.settings.numberQuestions]);
  const hasRequired = React.useMemo(() => allFields(doc).some((field) => field.required && collectsAnswer(field)), [doc]);

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
    let botToken: string | undefined;
    if (botCheck) {
      // Usually ready long before this; give an in-progress check a few seconds.
      const token = await waitForTurnstile(8000);
      if (!token) {
        setSendError(SEND_ERRORS.bot_check);
        setStatus("failed");
        return;
      }
      botToken = token;
    }
    try {
      const response = await fetch(`/api/f/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId: responseId(), renderToken, answers, website: honeypot, turnstileToken: botToken }),
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
      if (body.error === "bot_check") setTurnstileReset((count) => count + 1);
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
    // The last token was spent on the response just sent.
    setTurnstileReset((count) => count + 1);
  };

  /** "Clear form": asks first when there's something to lose. */
  const clearForm = () => {
    if (Object.keys(answers).length === 0) return startOver();
    setConfirmClear(true);
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
    <div ref={rootRef} data-program={doc.theme.accent} data-theme={themeAttribute} className={cx("fb-form text-text", transparent ? "bg-transparent" : "bg-bg", fullHeight && "min-h-dvh")}>
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
            {(mode === "preview" || (doc.settings.allowAnotherResponse && !(doc.settings.access.mode === "aiesec" && doc.settings.access.onePerPerson))) && (
              <Button variant="secondary" onClick={startOver}>
                Send another response
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
              {respondent && slug && (
                <div className="flex flex-col gap-1 rounded-md border border-border bg-bg-subtle px-4 py-3 ae-body-sm">
                  <p className="text-text">
                    Answering as <strong>{respondent.name}</strong>
                    {respondent.email ? ` (${respondent.email})` : ""}
                  </p>
                  {respondent.recorded && <p className="text-text-muted">The form&apos;s owner will see your name, email and AIESEC ID with your answers.</p>}
                  {respondent.canSwitch && <NotYou slug={slug} />}
                </div>
              )}
              {restored && (
                <p className="ae-body-sm text-text-muted">
                  We kept your answers from last time.{" "}
                  <button type="button" className="ae-link cursor-pointer border-0 bg-transparent p-0" onClick={clearForm}>
                    Clear form
                  </button>
                </p>
              )}
              {hasRequired && questionCount > 0 && <RequiredNote />}
            </header>

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
                          {numbers.has(field.id) ? `${numbers.get(field.id)}. ` : ""}
                          {field.label || "Untitled question"}: {errors[field.id]}
                        </a>
                      </li>
                    ))}
                  </ul>
                </Alert>
              </div>
            )}

            <form
              noValidate
              onSubmit={(event) => {
                // Enter in a text box on an earlier page moves on instead of sending.
                if (isLast) return void submit(event);
                event.preventDefault();
                next();
              }}
              className="flex flex-col gap-10"
              aria-label={doc.title || "Form"}
            >
              {(page.title || page.description) && multiPage && (
                <div className="flex flex-col gap-1 border-b border-border pb-4">
                  {page.title && <h2 className="ae-h3">{page.title}</h2>}
                  {page.description && <p className="whitespace-pre-line ae-body text-text-muted">{linkify(page.description)}</p>}
                </div>
              )}
              {page.fields.map((field) => (
                <Question key={field.id} field={field} number={numbers.get(field.id)} value={answers[field.id]} error={errors[field.id]} onChange={(value) => setAnswer(field.id, value)} optionOrder={optionOrders[field.id]} upload={upload} />
              ))}

              {/* Honeypot for bots; people never see or reach it. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                <label>
                  Website
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(event) => setHoneypot(event.target.value)} />
                </label>
              </div>

              {/* The bot check (invisible unless Cloudflare needs a click), any send error and the buttons stay together. */}
              <div className="flex flex-col gap-4">
                {botCheck && turnstileSiteKey && (
                  <Turnstile siteKey={turnstileSiteKey} theme={themeAttribute?.endsWith("dark") ? "dark" : themeAttribute?.endsWith("light") ? "light" : "auto"} onToken={onTurnstileToken} resetKey={turnstileReset} />
                )}

                {sendError && (
                  <Alert tone="danger" title="Not sent yet" live>
                    {sendError}
                  </Alert>
                )}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                  <div className="flex w-full gap-3 sm:w-auto">
                    {currentIndex > 0 && (
                      <Button variant="tertiary" size="lg" iconStart={<ArrowLeft size={20} aria-hidden="true" />} onClick={() => goTo(currentIndex - 1)}>
                        Back
                      </Button>
                    )}
                    {isLast ? (
                      <Button key="send" type="submit" variant="primary" size="lg" loading={status === "sending"} className="flex-1 sm:flex-none">
                        {status === "failed" ? "Try again" : doc.settings.submitLabel || "Send response"}
                      </Button>
                    ) : (
                      <Button key="next" variant="primary" size="lg" onClick={next} className="flex-1 sm:flex-none">
                        Next
                      </Button>
                    )}
                  </div>

                  {multiPage && doc.settings.showProgressBar && (
                    <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
                      <Progress label={`Page ${currentIndex + 1} of ${pages.length}`} hideLabel value={currentIndex + 1} max={pages.length} size="sm" tone="accent" className="max-w-56 min-w-16 flex-1" />
                      <span className="whitespace-nowrap ae-body-sm text-text-muted" aria-hidden="true">
                        Page {currentIndex + 1} of {pages.length}
                      </span>
                    </div>
                  )}

                  {questionCount > 0 && (
                    <button type="button" className="ml-auto cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 ae-link ae-body-sm" onClick={clearForm} disabled={status === "sending"}>
                      Clear form
                    </button>
                  )}

                </div>
              </div>
            </form>

            {questionCount === 0 && <p className="ae-body text-text-muted">This form has no questions yet.</p>}
          </>
        )}

        <FormFooter slug={mode === "preview" ? undefined : slug} turnstileSiteKey={botCheck ? turnstileSiteKey : null} />
      </div>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear form?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)} data-autofocus>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmClear(false);
                startOver();
                requestAnimationFrame(() => rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
              }}
            >
              Clear form
            </Button>
          </>
        }
      >
        <p className="ae-body">This removes your answers from all questions and can&apos;t be undone.</p>
      </Modal>
    </div>
  );
}
