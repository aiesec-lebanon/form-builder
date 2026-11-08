"use client";

import { CircleCheck } from "lucide-react";
import * as React from "react";

import { Alert, Button, Modal, RequiredNote, TextField, Textarea } from "@/components/aiesec";
import { MESSAGE_LIMITS, validateMessage, type MessageField } from "@/lib/forms/messages";

import { Turnstile } from "./Turnstile";

// "Contact form owner" (ADR-017), like Google Forms: the owner's email stays
// private; people send a subject and message, with their name and email so the
// owner can reply. Owners read messages in the builder's Messages tab.

type Props = {
  slug: string;
  open: boolean;
  onClose: () => void;
  turnstileSiteKey: string | null;
};

type Values = Record<MessageField, string>;
const EMPTY: Values = { name: "", email: "", subject: "", message: "" };

export function ContactOwnerDialog({ slug, open, onClose, turnstileSiteKey }: Props) {
  const formId = React.useId();
  const [values, setValues] = React.useState<Values>(EMPTY);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<MessageField, string>>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [website, setWebsite] = React.useState("");
  const token = React.useRef<string | null>(null);
  const tokenWaiter = React.useRef<((value: string) => void) | null>(null);
  const [resetKey, setResetKey] = React.useState(0);
  const onToken = React.useCallback((value: string | null) => {
    token.current = value;
    if (value && tokenWaiter.current) {
      tokenWaiter.current(value);
      tokenWaiter.current = null;
    }
  }, []);
  // The invisible check is usually done long before Send; give one in progress a few seconds.
  const waitForToken = (ms: number) =>
    new Promise<string | null>((resolve) => {
      if (token.current) return resolve(token.current);
      const timer = setTimeout(() => {
        tokenWaiter.current = null;
        resolve(null);
      }, ms);
      tokenWaiter.current = (value) => {
        clearTimeout(timer);
        resolve(value);
      };
    });

  const update = (key: MessageField) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setValues((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const close = () => {
    onClose();
    // A sent message starts the next one fresh; an unsent draft is kept.
    if (sentTo) {
      setValues(EMPTY);
      setSentTo(null);
      setResetKey((count) => count + 1);
    }
  };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const checked = validateMessage(values);
    if (!checked.ok) return setFieldErrors(checked.fieldErrors);
    setSending(true);
    try {
      const botToken = turnstileSiteKey ? await waitForToken(8000) : null;
      if (turnstileSiteKey && !botToken) return setError("Complete the check above the button, then send again.");
      const response = await fetch(`/api/f/${slug}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website, turnstileToken: botToken ?? undefined }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; error?: string; fieldErrors?: Partial<Record<MessageField, string>> };
      if (response.ok) return setSentTo(values.email.trim());
      if (response.status === 422 && body.fieldErrors) return setFieldErrors(body.fieldErrors);
      if (body.error === "bot_check") setResetKey((count) => count + 1);
      setError(body.message ?? "Your message wasn't sent. Try again.");
    } catch {
      setError("Your message wasn't sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Contact form owner"
      footer={
        sentTo !== null ? (
          <Button variant="primary" onClick={close} data-autofocus>
            Close
          </Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" loading={sending}>
              Send message
            </Button>
          </>
        )
      }
    >
      {sentTo !== null ? (
        <div aria-live="polite" className="flex flex-col items-start gap-3 text-left">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-success-soft text-success-text">
            <CircleCheck size={28} aria-hidden="true" />
          </span>
          <p className="ae-body font-bold text-text">Message sent</p>
          <p className="ae-body-sm text-text-muted">The form owner can reply to {sentTo}.</p>
        </div>
      ) : (
        <form id={formId} noValidate onSubmit={send} className="flex flex-col gap-4 text-left">
          <RequiredNote />
          {error && (
            <Alert tone="danger" title="Not sent yet" live>
              {error}
            </Alert>
          )}
          <TextField label="Your name" required autoComplete="name" maxLength={MESSAGE_LIMITS.name} value={values.name} onChange={update("name")} error={fieldErrors.name} />
          <TextField
              label="Your email"
              required
              type="email"
              inputMode="email"
              autoComplete="email"
              hint="The form owner replies to this address."
              maxLength={MESSAGE_LIMITS.email}
              value={values.email}
              onChange={update("email")}
              error={fieldErrors.email}
            />
          <TextField label="Subject" required maxLength={MESSAGE_LIMITS.subject} value={values.subject} onChange={update("subject")} error={fieldErrors.subject} />
          <Textarea label="Message" required rows={5} maxLength={MESSAGE_LIMITS.body} showCount value={values.message} onChange={update("message")} error={fieldErrors.message} />
          <p className="ae-body-sm text-text-muted">Your name and email go to the form owner with your message, so they can reply. Never send passwords.</p>
          {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} theme="auto" onToken={onToken} resetKey={resetKey} />}
          {/* Honeypot for bots; people never see or reach it. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>
              Website
              <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>
          </div>
        </form>
      )}
    </Modal>
  );
}
