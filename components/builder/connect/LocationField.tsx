"use client";

import { FileSpreadsheet, Folder, FolderSearch } from "lucide-react";
import * as React from "react";

import { Alert, Badge, Button, Spinner, TextField } from "@/components/aiesec";
import { checkGoogleLocation, googlePickerSession } from "@/actions/google";
import { driveLinkProblem, parseDriveLink, type DriveLocation, type WantedKind } from "@/lib/google/links";

import { confirmInDrive, pickFromDrive, withDialogHidden } from "./google-picker";

// "Where should this go?": a Drive folder or Sheet link the owner pastes, or one
// they browse to, in My Drive or a shared drive. Links are checked with Google
// as soon as they're pasted. AIESEC Forms only has drive.file access, so a link
// to something it hasn't been given yet is confirmed in Google's chooser, which
// shows just that one file.

type Result = { step: "checking" } | { step: "needs_access"; fileId: string } | { step: "ready"; location: DriveLocation } | { step: "error"; message: string };

const EMPTY: Record<WantedKind, string> = {
  folder: "Paste a folder link, or choose one with Browse Drive.",
  spreadsheet: "Paste a Sheet link, or choose one with Browse Drive.",
};
const NOUN: Record<WantedKind, string> = { folder: "folder", spreadsheet: "Sheet" };
const CHOOSER_FAILED = "Google's file chooser didn't open. Try again.";

/** Answers are kept per account and link, so a slow answer never lands on another link. */
const keyOf = (accountId: string, link: string) => `${accountId} ${link}`;

export type DriveLocationChoice = ReturnType<typeof useDriveLocation>;

/**
 * State for one location field. `ensure()` (on submit) finishes whatever is left,
 * Google's confirmation included, and resolves with the checked location, or null
 * when the field now says what to fix.
 */
export function useDriveLocation(kind: WantedKind, account: { id: string; email: string }, anchor: React.RefObject<Element | null>) {
  const [link, setLink] = React.useState("");
  const [results, setResults] = React.useState<Record<string, Result>>({});
  const [busy, setBusy] = React.useState<"browse" | "confirm" | null>(null);
  // The field is focused by id when submitting finds a problem (no ref: this state is read while rendering).
  const inputId = React.useId();
  // A link already being checked (leaving the field, then submitting) is asked about once.
  const inflight = React.useRef(new Map<string, Promise<Result>>());

  const text = link.trim();
  const shown = results[keyOf(account.id, text)] ?? null;

  /** Asks the server about `query` (a link or a file id) and records the answer for the link `forLink`. */
  const lookUp = (query: string, forLink: string): Promise<Result> => {
    const accountId = account.id;
    const key = keyOf(accountId, forLink);
    const record = (result: Result) => {
      setResults((current) => ({ ...current, [key]: result }));
      return result;
    };
    const problem = query ? driveLinkProblem(parseDriveLink(query), kind) : EMPTY[kind];
    if (problem) return Promise.resolve(record({ step: "error", message: problem }));
    const asking = `${key} ${query}`;
    const running = inflight.current.get(asking);
    if (running) return running;
    record({ step: "checking" });
    const promise = checkGoogleLocation(accountId, { link: query, kind })
      .then((answer): Result => {
        if (!answer.ok) return { step: "error", message: answer.error };
        return answer.data.status === "ready" ? { step: "ready", location: answer.data.location } : { step: "needs_access", fileId: answer.data.fileId };
      })
      .catch((): Result => ({ step: "error", message: "Couldn't check the link. Try again." }))
      .then((answer) => {
        inflight.current.delete(asking);
        return record(answer);
      });
    inflight.current.set(asking, promise);
    return promise;
  };

  const fail = (forLink: string, message: string) => setResults((current) => ({ ...current, [keyOf(account.id, forLink)]: { step: "error", message } }));

  /** Google's chooser showing just the linked file; choosing it lets AIESEC Forms open it. */
  const confirm = async (fileId: string, forLink: string): Promise<DriveLocation | null> => {
    setBusy("confirm");
    try {
      const session = await googlePickerSession(account.id);
      if (!session.ok) {
        fail(forLink, session.error);
        return null;
      }
      const picked = await withDialogHidden(anchor.current, () => confirmInDrive(session.data, fileId, kind));
      // Closed without choosing: the "Confirm in Google" prompt stays up.
      if (!picked) return null;
      const after = await lookUp(picked.id, forLink);
      if (after.step === "ready") return after.location;
      if (after.step === "needs_access") fail(forLink, `AIESEC Forms still can't open it. Check that ${account.email} can open the link, then try again.`);
      return null;
    } catch (caught) {
      fail(forLink, caught instanceof Error ? caught.message : CHOOSER_FAILED);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /** Google's chooser with My Drive and shared drives; the chosen one fills the field. */
  const browse = async () => {
    setBusy("browse");
    const forLink = text;
    try {
      const session = await googlePickerSession(account.id);
      if (!session.ok) return fail(forLink, session.error);
      const picked = await withDialogHidden(anchor.current, () => pickFromDrive(session.data, kind, kind === "folder" ? "Choose a folder" : "Choose a Sheet"));
      if (!picked) return;
      const after = await lookUp(picked.id, forLink);
      if (after.step !== "ready") return;
      setLink(after.location.url);
      setResults((current) => ({ ...current, [keyOf(account.id, after.location.url)]: after }));
    } catch (caught) {
      fail(forLink, caught instanceof Error ? caught.message : CHOOSER_FAILED);
    } finally {
      setBusy(null);
    }
  };

  const ensure = async (): Promise<DriveLocation | null> => {
    if (shown?.step === "ready") return shown.location;
    const answer = await lookUp(text, text);
    if (answer.step === "ready") return answer.location;
    if (answer.step === "needs_access") return confirm(answer.fileId, text);
    document.getElementById(inputId)?.focus();
    return null;
  };

  return {
    kind,
    email: account.email,
    link,
    shown,
    busy,
    inputId,
    ensure,
    browse,
    confirm: () => (shown?.step === "needs_access" ? confirm(shown.fileId, text) : Promise.resolve(null)),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setLink(value);
      // A pasted link is checked straight away; a typed one on Enter or when leaving the field.
      if ((event.nativeEvent as InputEvent).inputType === "insertFromPaste" && value.trim()) void lookUp(value.trim(), value.trim());
    },
    onBlur: () => {
      if (text && !shown) void lookUp(text, text);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (text) void lookUp(text, text);
    },
  };
}

type Props = {
  choice: DriveLocationChoice;
  hint?: React.ReactNode;
  disabled?: boolean;
};

export function LocationField({ choice, hint, disabled }: Props) {
  const { kind, shown, busy } = choice;
  const Icon = kind === "folder" ? Folder : FileSpreadsheet;
  const noun = NOUN[kind];
  return (
    <div className="flex flex-col gap-3">
      <TextField
        id={choice.inputId}
        label={kind === "folder" ? "Folder link" : "Sheet link"}
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder={kind === "folder" ? "https://drive.google.com/drive/folders/…" : "https://docs.google.com/spreadsheets/d/…"}
        value={choice.link}
        onChange={choice.onChange}
        onBlur={choice.onBlur}
        onKeyDown={choice.onKeyDown}
        hint={hint}
        error={shown?.step === "error" ? shown.message : undefined}
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button size="sm" iconStart={<FolderSearch size={16} aria-hidden="true" />} loading={busy === "browse"} disabled={disabled || busy !== null} onClick={() => void choice.browse()}>
          Browse Drive
        </Button>
        <div aria-live="polite" className="min-w-0">
          {shown?.step === "checking" && (
            <span className="flex items-center gap-2 ae-body-sm text-text-muted">
              <Spinner size="sm" label="" />
              Checking the link…
            </span>
          )}
          {shown?.step === "ready" && (
            <span className="flex min-w-0 flex-wrap items-center gap-2 ae-body-sm">
              <Icon size={18} aria-hidden="true" className="shrink-0 text-text-muted" />
              <span className="sr-only">Saving in </span>
              <a className="ae-link break-all font-bold" href={shown.location.url} target="_blank" rel="noreferrer">
                {shown.location.name}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              {shown.location.sharedDrive && <Badge tone="info">Shared drive</Badge>}
            </span>
          )}
        </div>
      </div>
      {shown?.step === "needs_access" && (
        <Alert
          tone="info"
          title={`Confirm the ${noun} in Google`}
          live
          actions={
            <Button size="sm" variant="primary" loading={busy === "confirm"} disabled={disabled || busy === "browse"} onClick={() => void choice.confirm()}>
              Confirm in Google
            </Button>
          }
        >
          AIESEC Forms can only open files you choose, so Google shows you this {noun} to confirm. If it doesn&apos;t appear, {choice.email} can&apos;t open the link: ask for access or use another account.
        </Alert>
      )}
    </div>
  );
}
