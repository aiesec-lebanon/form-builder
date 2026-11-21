"use client";

import { CircleCheck } from "lucide-react";
import * as React from "react";

import { Alert, Button, RadioGroup, RequiredNote, TextField, useToast } from "@/components/aiesec";
import { addGoogleDrive, addGoogleSheet, addPostgres, addSupabase, addWebhook } from "@/actions/destinations";
import { googlePickerSession, setGoogleFolderLocation } from "@/actions/google";
import { CopyBlock } from "@/components/app/CopyBlock";
import { POSTGRES_TABLE_SQL, SUPABASE_TABLE_SQL } from "@/lib/destinations/sql";
import type { DestinationSummary, DestinationType } from "@/lib/destinations/types";

import { Sheet } from "../Sheet";
import { pickFromDrive, withDialogHidden } from "./google-picker";
import { LocationField, useDriveLocation } from "./LocationField";
import { DESTINATION_META, WEBHOOK_VERIFY_SNIPPET, type GoogleAccount } from "./shared";

type Props = {
  type: DestinationType | null;
  formId: string;
  onClose: () => void;
  onDestinations: (destinations: DestinationSummary[]) => void;
  googleConfigured: boolean;
  /** Google Picker is set up: owners can use an existing Sheet, a folder of their own (link or browse) and move AIESEC Forms. */
  googlePicker: boolean;
  googleAccounts: GoogleAccount[];
  /** Where Google should send people back to after connecting. */
  googleReturnTo: string;
};

type FieldErrors = Record<string, string>;
type Outcome = { ok: true; data: { destinations: DestinationSummary[] } & Record<string, unknown> } | { ok: false; error: string; fieldErrors?: FieldErrors };

export function SetupSheet({ type, formId, onClose, onDestinations, googleConfigured, googlePicker, googleAccounts, googleReturnTo }: Props) {
  const toast = useToast();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [values, setValues] = React.useState<Record<string, string>>({ table: "form_responses", schema: "public" });
  const [account, setAccount] = React.useState(googleAccounts[0]?.id ?? "");
  const [webhookSecret, setWebhookSecret] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const [sheetSource, setSheetSource] = React.useState<"new" | "existing">("new");
  /** Where a new Sheet or the uploads go: the form's folder in AIESEC Forms, or a folder the owner chooses. */
  const [placement, setPlacement] = React.useState<"default" | "chosen">("default");
  const [picking, setPicking] = React.useState(false);
  const [rootFolders, setRootFolders] = React.useState<Record<string, string | null>>(() => Object.fromEntries(googleAccounts.map((item) => [item.id, item.rootFolderId])));
  const accountInfo = { id: account, email: googleAccounts.find((item) => item.id === account)?.email ?? "your Google account" };
  const folderChoice = useDriveLocation("folder", accountInfo, formRef);
  const sheetChoice = useDriveLocation("spreadsheet", accountInfo, formRef);

  /** Google Picker for the chosen account: where the AIESEC Forms folder goes. */
  const moveRootFolder = async () => {
    setError(null);
    setPicking(true);
    try {
      const session = await googlePickerSession(account);
      if (!session.ok) return setError(session.error);
      const picked = await withDialogHidden(formRef.current, () => pickFromDrive(session.data, "folder"));
      if (!picked) return;
      const moved = await setGoogleFolderLocation(account, picked.id);
      if (!moved.ok) return setError(moved.error);
      setRootFolders((current) => ({ ...current, [account]: moved.data.rootFolderId }));
      toast.show(
        moved.data.moved
          ? { title: `AIESEC Forms is now in “${moved.data.parentName}”` }
          : {
              title: `New forms will be saved in “${moved.data.parentName}”`,
              description: "Your existing forms' files stay where they are: moving a folder into a shared drive needs the Manager role there.",
            },
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google's file chooser didn't open. Try again.");
    } finally {
      setPicking(false);
    }
  };

  // The parent keys this component by `type`, so every setup starts fresh.
  if (!type) return null;
  const meta = DESTINATION_META[type];
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }));

  /** `action` resolves with null when a field already says what to fix (e.g. a folder link). */
  const run = (action: () => Promise<Outcome | null>, after?: (data: Record<string, unknown>) => boolean) =>
    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const result = await action();
      if (!result) return;
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onDestinations(result.data.destinations);
      const keepOpen = after?.(result.data) ?? false;
      if (!keepOpen) {
        const notice = typeof result.data.notice === "string" ? result.data.notice : undefined;
        toast.show({ title: `${meta.name} connected`, description: notice, tone: notice ? "warning" : undefined });
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
    } else if (type === "google_sheets" && sheetSource === "existing") {
      run(async () => {
        const sheet = await sheetChoice.ensure();
        return sheet ? addGoogleSheet(formId, { connectionId: account, spreadsheetId: sheet.id }) : null;
      });
    } else if (type === "google_sheets" || type === "google_drive") {
      const add = (folderId?: string) => (type === "google_sheets" ? addGoogleSheet : addGoogleDrive)(formId, { connectionId: account, ...(folderId ? { folderId } : {}) });
      run(async () => {
        if (placement === "default" || !googlePicker) return add();
        const folder = await folderChoice.ensure();
        return folder ? add(folder.id) : null;
      });
    }
  };

  const isGoogle = type === "google_sheets" || type === "google_drive";
  const connectHref = `/api/google/connect?returnTo=${encodeURIComponent(`${googleReturnTo}&setup=${type}`)}`;
  const rootFolder = rootFolders[account] ?? null;
  const showGoogleOptions = isGoogle && googleConfigured && googleAccounts.length > 0;
  const ownFolder = googlePicker && placement === "chosen";
  const actionLabel = {
    google_sheets: sheetSource === "existing" ? "Use this Sheet" : "Create the Sheet",
    google_drive: ownFolder ? "Use this folder" : "Create the uploads folder",
    webhook: "Connect webhook",
    supabase: "Test and connect",
    postgres: "Test and connect",
  }[type];

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
        <form ref={formRef} id="setup-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <p className="ae-body-sm text-text-muted">{meta.blurb}</p>
          {(type === "webhook" || type === "supabase" || type === "postgres") && <RequiredNote />}
          {error && (
            <Alert tone="danger" title="Not connected yet" live>
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
                <p className="ae-body">Connect your AIESEC Google account once. Sheets and upload folders are created in its Drive, and we only get access to files AIESEC Forms creates or you choose.</p>
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
              <RadioGroup
                legend="Google account"
                name="google-account"
                value={account}
                onChange={(value) => setAccount(value)}
                options={googleAccounts.map((item) => ({ value: item.id, label: item.email }))}
              />
            ))}

          {showGoogleOptions && type === "google_sheets" && googlePicker && (
            <RadioGroup
              legend="Send responses to"
              name="sheet-source"
              value={sheetSource}
              onChange={(value) => setSheetSource(value === "existing" ? "existing" : "new")}
              options={[
                { value: "new", label: "A new Sheet", hint: "Named after this form." },
                { value: "existing", label: "A Sheet you already have", hint: "We add a tab for this form. Your other tabs aren't touched." },
              ]}
            />
          )}

          {showGoogleOptions && type === "google_sheets" && googlePicker && sheetSource === "existing" && (
            <LocationField choice={sheetChoice} disabled={pending} hint="From My Drive or a shared drive. You need edit access to it." />
          )}

          {showGoogleOptions && googlePicker && (type === "google_drive" || sheetSource === "new") && (
            <RadioGroup
              legend={type === "google_drive" ? "Save uploads in" : "Save the Sheet in"}
              name="placement"
              value={placement}
              onChange={(value) => setPlacement(value === "chosen" ? "chosen" : "default")}
              options={[
                { value: "default", label: "This form's folder in AIESEC Forms", hint: "A folder named after this form, made for you." },
                {
                  value: "chosen",
                  label: "A folder you choose",
                  hint: type === "google_drive" ? "Any folder in My Drive or a shared drive. Each file question gets its own folder inside it." : "Any folder in My Drive or a shared drive.",
                },
              ]}
            />
          )}

          {showGoogleOptions && googlePicker && (type === "google_drive" || sheetSource === "new") && placement === "chosen" && (
            <LocationField choice={folderChoice} disabled={pending} hint="Paste the folder's link from your browser, or browse for it. A shared drive keeps files with your entity after handovers." />
          )}

          {showGoogleOptions && (type === "google_drive" || sheetSource === "new") && (placement === "default" || !googlePicker) && (
            <p className="ae-body-sm text-text-muted">
              {rootFolder ? (
                <>
                  Saved in your{" "}
                  <a className="ae-link" href={`https://drive.google.com/drive/folders/${rootFolder}`} target="_blank" rel="noreferrer">
                    AIESEC Forms
                  </a>{" "}
                  folder.
                </>
              ) : (
                <>Saved in an AIESEC Forms folder in your My Drive.</>
              )}{" "}
              {googlePicker && (
                <button type="button" className="ae-link cursor-pointer border-0 bg-transparent p-0" disabled={picking} onClick={() => void moveRootFolder()}>
                  {rootFolder ? "Move AIESEC Forms" : "Choose where AIESEC Forms goes"}
                </button>
              )}
              {googlePicker && <span className="mt-1 block">Put it in your entity&apos;s shared drive so the files stay with the entity after handovers.</span>}
            </p>
          )}

          {type === "webhook" && (
            <TextField label="Webhook URL" required type="url" inputMode="url" placeholder="https://hooks.zapier.com/…" hint="Use an https:// address. Each response arrives as a signed JSON POST." value={values.url ?? ""} onChange={set("url")} error={fieldErrors.url} autoFocus />
          )}

          {type === "supabase" && (
            <>
              <TextField label="Project URL" required type="url" placeholder="https://abcdefgh.supabase.co" value={values.projectUrl ?? ""} onChange={set("projectUrl")} error={fieldErrors.projectUrl} autoFocus />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Table" required value={values.table ?? ""} onChange={set("table")} error={fieldErrors.table} />
                <TextField label="Schema" required value={values.schema ?? ""} onChange={set("schema")} error={fieldErrors.schema} />
              </div>
              <TextField label="Secret key" required type="password" autoComplete="off" hint="Project Settings → API Keys → secret key. Stored encrypted; never shown again." value={values.apiKey ?? ""} onChange={set("apiKey")} error={fieldErrors.apiKey} />
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
                required
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
                <TextField label="Table" required value={values.table ?? ""} onChange={set("table")} error={fieldErrors.table} />
                <TextField label="Schema" required value={values.schema ?? ""} onChange={set("schema")} error={fieldErrors.schema} />
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
