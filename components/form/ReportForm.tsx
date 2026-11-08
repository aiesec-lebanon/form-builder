"use client";

import { CircleCheck } from "lucide-react";
import * as React from "react";

import { Alert, Button, RadioGroup, TextField, Textarea } from "@/components/aiesec";
import { RequiredLegend, requiredLabel } from "@/components/app/RequiredMark";
import { REPORT_REASON_LABEL, REPORT_REASONS, type ReportReason } from "@/lib/forms/reports";

/** "Does this form look suspicious?": the report itself. */
export function ReportForm({ slug }: { slug: string }) {
  const [reason, setReason] = React.useState<ReportReason | "">("");
  const [details, setDetails] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!reason) return setReasonError("Choose what's wrong with the form.");
    setReasonError(null);
    setSending(true);
    try {
      const response = await fetch(`/api/f/${slug}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details, contact: contact.trim(), website }),
      });
      if (response.ok) return setSent(true);
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setError(body.message ?? "Your report wasn't sent. Try again.");
    } catch {
      setError("Your report wasn't sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <section aria-live="polite" className="flex flex-col items-start gap-4">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-success-soft text-success-text">
          <CircleCheck size={32} aria-hidden="true" />
        </span>
        <h2 className="ae-h3">Thanks, we got your report</h2>
        <p className="ae-body text-text-muted">The platform team will look at this form. If you typed a password into it, change that password now.</p>
      </section>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6">
      <RequiredLegend />
      {error && (
        <Alert tone="danger" title="Not sent yet" live>
          {error}
        </Alert>
      )}
      <RadioGroup
        legend={requiredLabel("What's wrong with this form?")}
        name="reason"
        value={reason}
        onChange={(value) => {
          setReason(value as ReportReason);
          setReasonError(null);
        }}
        error={reasonError}
        required
        options={REPORT_REASONS.map((value) => ({ value, label: REPORT_REASON_LABEL[value] }))}
      />
      <Textarea label="Details" hint="What made you suspicious? Don't include passwords." rows={4} maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} />
      <TextField
        label="Your email"
        type="email"
        inputMode="email"
        autoComplete="email"
        hint="Only if you'd like us to follow up."
        maxLength={254}
        value={contact}
        onChange={(event) => setContact(event.target.value)}
      />
      {/* Honeypot for bots; people never see or reach it. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={sending} className="self-start">
        Send report
      </Button>
    </form>
  );
}
