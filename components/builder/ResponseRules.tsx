"use client";

import * as React from "react";

import { Button, Switch, TextField, useToast } from "@/components/aiesec";
import { setAcceptingResponses, updateResponseRules } from "@/actions/publish";
import { plural } from "@/lib/format";

type Rules = { acceptingResponses: boolean; closesAt: string | null; responseLimit: number | null };

type Props = Rules & {
  formId: string;
  responseCount: number;
  onChange: (rules: Partial<Rules>) => void;
};

/** ISO → value for <input type="datetime-local"> in the viewer's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Responses on/off, close date and limit. These apply immediately: no republish. */
export function ResponseRules({ formId, acceptingResponses, closesAt, responseLimit, responseCount, onChange }: Props) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [closeInput, setCloseInput] = React.useState(toLocalInput(closesAt));
  const [limitInput, setLimitInput] = React.useState(responseLimit ? String(responseLimit) : "");
  const [error, setError] = React.useState<string | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dirty = closeInput !== toLocalInput(closesAt) || limitInput !== (responseLimit ? String(responseLimit) : "");

  const save = () => {
    const limit = limitInput.trim() ? Number(limitInput) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return setError("Enter a whole number of at least 1, or leave it empty.");
    const close = closeInput ? new Date(closeInput) : null;
    if (close && Number.isNaN(close.getTime())) return setError("Enter a valid date and time.");
    setError(null);
    startTransition(async () => {
      const result = await updateResponseRules(formId, { closesAt: close ? close.toISOString() : null, responseLimit: limit });
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't save", description: result.error });
      onChange(result.data);
      toast.show({ title: "Response settings saved" });
    });
  };

  const toggle = (accepting: boolean) =>
    startTransition(async () => {
      const result = await setAcceptingResponses(formId, accepting);
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't change that", description: result.error });
      onChange({ acceptingResponses: result.data.acceptingResponses });
    });

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="ae-h4">Responses</h2>
        <p className="ae-body-sm text-text-muted">These take effect straight away, without publishing again.</p>
      </div>
      <Switch label="Accepting responses" hint="Turn off to close the form now." checked={acceptingResponses} disabled={pending} onChange={(event) => toggle(event.target.checked)} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Stop accepting on" optional type="datetime-local" hint={`Your time zone: ${timeZone}`} value={closeInput} onChange={(event) => setCloseInput(event.target.value)} />
        <TextField
          label="Stop after this many responses"
          optional
          type="number"
          inputMode="numeric"
          min={1}
          hint={`So far: ${plural(responseCount, "response")}`}
          value={limitInput}
          onChange={(event) => setLimitInput(event.target.value)}
        />
      </div>
      {error && <p className="ae-field__error ae-body-sm">{error}</p>}
      <div>
        <Button variant="secondary" onClick={save} disabled={!dirty} loading={pending}>
          Save response settings
        </Button>
      </div>
    </section>
  );
}
