"use client";

import { CircleCheck } from "lucide-react";
import * as React from "react";

import { Alert, Button, RadioGroup, TextField, useToast } from "@/components/aiesec";
import { addGoogleDrive, addGoogleSheet, addPostgres, addSupabase, addWebhook } from "@/actions/destinations";
import { CopyBlock } from "@/components/app/CopyBlock";
import { POSTGRES_TABLE_SQL, SUPABASE_TABLE_SQL } from "@/lib/destinations/sql";
import type { DestinationSummary, DestinationType } from "@/lib/destinations/types";

import { Sheet } from "../Sheet";
import { DESTINATION_META, WEBHOOK_VERIFY_SNIPPET, type GoogleAccount } from "./shared";

type Props = {
  type: DestinationType | null;
  formId: string;
  onClose: () => void;
  onDestinations: (destinations: DestinationSummary[]) => void;
  googleConfigured: boolean;
  googleAccounts: GoogleAccount[];
  /** Where Google should send people back to after connecting. */
  googleReturnTo: string;
};

type FieldErrors = Record<string, string>;

export function SetupSheet({ type, formId, onClose, onDestinations, googleConfigured, googleAccounts, googleReturnTo }: Props) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [values, setValues] = React.useState<Record<string, string>>({ table: "form_responses", schema: "public" });
  const [account, setAccount] = React.useState(googleAccounts[0]?.id ?? "");
  const [webhookSecret, setWebhookSecret] = React.useState<string | null>(null);

  // The parent keys this component by `type`, so every setup starts fresh.
  if (!type) return null;
  const meta = DESTINATION_META[type];
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  const run = (action: () => Promise<{ ok: true; data: { destinations: DestinationSummary[] } & Record<string, unknown> } | { ok: false; error: string; fieldErrors?: FieldErrors }>, after?: (data: Record<string, unknown>) => boolean) =>
    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onDestinations(result.data.destinations);
      const keepOpen = after?.(result.data) ?? false;
      if (!keepOpen) {
        toast.show({ title: `${meta.name} connected` });
        onClose();
      }
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (type === "webhook") {
      run(
        () => addWebhook(formId, { url: values.url ?? "" }),
        (data) => {
          setWebhookSecret(String(data.signingSecret));
          return true;
        },
      );
    } else if (type === "supabase") {
      run(() => addSupabase(formId, { projectUrl: values.projectUrl ?? "", table: values.table ?? "", schema: values.schema ?? "public", apiKey: values.apiKey ?? "" }));
    } else if (type === "postgres") {
      run(() => addPostgres(formId, { connectionString: values.connectionString ?? "", table: values.table ?? "", schema: values.schema ?? "public" }));
    } else if (type === "google_sheets") {
      run(() => addGoogleSheet(formId, { connectionId: account }));
    } else if (type === "google_drive") {
      run(() => addGoogleDrive(formId, { connectionId: account }));
    }
  };

  const isGoogle = type === "google_sheets" || type === "google_drive";
  const connectHref = `/api/google/connect?returnTo=${encodeURIComponent(`${googleReturnTo}&setup=${type}`)}`;
  const actionLabel = { google_sheets: "Create the Sheet", google_drive: "Create the uploads folder", webhook: "Connect webhook", supabase: "Test and connect", postgres: "Test and connect" }[type];

  const footer =
    webhookSecret !== null ? (
      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    ) : isGoogle && (!googleConfigured || googleAccounts.length === 0) ? null : (
      <>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" form="setup-form" loading={pending}>
          {actionLabel}
        </Button>
      </>
    );

  return (
    <Sheet open onClose={onClose} title={webhookSecret ? "Webhook connected" : `Connect ${meta.name}`} footer={footer} width={600}>
      {webhookSecret !== null ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-center gap-2 ae-body text-success-text">
            <CircleCheck size={20} aria-hidden="true" />
            Responses will be posted to your webhook.
          </p>
          <p className="ae-body-sm text-text-muted">This signing secret proves requests come from AIESEC Forms. You can see it again from the webhook&apos;s menu.</p>
          <CopyBlock label="Signing secret" value={webhookSecret} wrap />
          <details className="rounded-md border border-border p-3">
            <summary className="cursor-pointer ae-label">How to verify requests</summary>
            <div className="pt-3">
              <CopyBlock label="Verification example" value={WEBHOOK_VERIFY_SNIPPET} />
            </div>
          </details>
        </div>
      ) : (
        <form id="setup-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <p className="ae-body-sm text-text-muted">{meta.blurb}</p>
          {error && (
            <Alert tone="danger" title="That didn't work" live>
              {error}
            </Alert>
          )}

          {isGoogle &&
            (!googleConfigured ? (
              <Alert tone="info" title="Google isn't set up on this server yet">
                Ask your platform admin to add the Google OAuth client. Meanwhile, use a webhook, Supabase or PostgreSQL.
              </Alert>
            ) : googleAccounts.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="ae-body">Connect a Google account once. We only get access to files AIESEC Forms creates, nothing else in your Drive.</p>
                <Button as="a" href={connectHref} variant="primary">
                  Connect Google
                </Button>
              </div>
            ) : googleAccounts.length === 1 ? (
              <p className="ae-body">
                Using <strong>{googleAccounts[0].email}</strong>.{" "}
                <a className="ae-link" href={connectHref}>
                  Use another account
                </a>
              </p>
            ) : (
              <RadioGroup legend="Google account" name="google-account" value={account} onChange={setAccount} options={googleAccounts.map((item) => ({ value: item.id, label: item.email }))} />
            ))}

          {type === "webhook" && (
            <TextField label="Webhook URL" type="url" inputMode="url" placeholder="https://hooks.zapier.com/…" hint="Must start with https://. We send a POST with JSON for every response." value={values.url ?? ""} onChange={set("url")} error={fieldErrors.url} autoFocus />
          )}

          {type === "supabase" && (
            <>
              <TextField label="Project URL" type="url" placeholder="https://abcdefgh.supabase.co" value={values.projectUrl ?? ""} onChange={set("projectUrl")} error={fieldErrors.projectUrl} autoFocus />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Table" value={values.table ?? ""} onChange={set("table")} error={fieldErrors.table} />
                <TextField label="Schema" value={values.schema ?? ""} onChange={set("schema")} error={fieldErrors.schema} />
              </div>
              <TextField label="Secret key" type="password" autoComplete="off" hint="Project Settings → API Keys → secret key. Stored encrypted; never shown again." value={values.apiKey ?? ""} onChange={set("apiKey")} error={fieldErrors.apiKey} />
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer ae-label">Create the table first (SQL editor)</summary>
                <div className="pt-3">
                  <CopyBlock label="Setup SQL" value={SUPABASE_TABLE_SQL} />
                </div>
              </details>
            </>
          )}

          {type === "postgres" && (
            <>
              <TextField
                label="Connection string"
                type="password"
                autoComplete="off"
                placeholder="postgresql://user:password@host:5432/database"
                hint="Stored encrypted; never shown again. The connection uses TLS."
                value={values.connectionString ?? ""}
                onChange={set("connectionString")}
                error={fieldErrors.connectionString}
                autoFocus
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Table" value={values.table ?? ""} onChange={set("table")} error={fieldErrors.table} />
                <TextField label="Schema" value={values.schema ?? ""} onChange={set("schema")} error={fieldErrors.schema} />
              </div>
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer ae-label">Create the table first</summary>
                <div className="pt-3">
                  <CopyBlock label="Setup SQL" value={POSTGRES_TABLE_SQL} />
                </div>
              </details>
            </>
          )}
        </form>
      )}
    </Sheet>
  );
}
