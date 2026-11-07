"use client";

import * as React from "react";

import { saveDraft } from "@/actions/builder";
import type { FormDocument } from "@/lib/forms/schema";

// Autosave (spec §8): 800 ms after the last change, one save in flight,
// optimistic revision check, offline retry with backoff, and a local backup
// until the server confirms.

export type SaveStatus = "saved" | "unsaved" | "saving" | "offline" | "conflict" | "error";

const DEBOUNCE_MS = 800;
const RETRY_DELAYS = [2000, 5000, 10000, 30000];

const backupKey = (formId: string) => `aiesec-forms:backup:${formId}`;

export function readBackup(formId: string): { doc: FormDocument; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(backupKey(formId));
    return raw ? (JSON.parse(raw) as { doc: FormDocument; savedAt: number }) : null;
  } catch {
    return null;
  }
}

export function clearBackup(formId: string): void {
  try {
    window.localStorage.removeItem(backupKey(formId));
  } catch {
    // Storage unavailable (private mode): nothing to clear.
  }
}

function writeBackup(formId: string, doc: FormDocument): void {
  try {
    window.localStorage.setItem(backupKey(formId), JSON.stringify({ doc, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable: autosave still runs.
  }
}

type Options = {
  formId: string;
  doc: FormDocument;
  initialDoc: FormDocument;
  initialRevision: number;
  onSaved?: (revision: number) => void;
};

export function useAutosave({ formId, doc, initialDoc, initialRevision, onSaved }: Options) {
  const [status, setStatus] = React.useState<SaveStatus>("saved");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const revision = React.useRef(initialRevision);
  const savedJson = React.useRef(JSON.stringify(initialDoc));
  const latest = React.useRef(doc);
  const inFlight = React.useRef(false);
  const queued = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = React.useRef(0);
  const statusRef = React.useRef(status);
  const onSavedRef = React.useRef(onSaved);
  // Lets the save loop reschedule itself without referring to its own binding.
  const flushRef = React.useRef<() => Promise<void>>(async () => undefined);
  const scheduleFlush = React.useCallback((delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), delay);
  }, []);

  React.useEffect(() => {
    latest.current = doc;
    statusRef.current = status;
    onSavedRef.current = onSaved;
  });

  const flush = React.useCallback(async () => {
    clearTimeout(timer.current);
    if (statusRef.current === "conflict") return;
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    const snapshot = latest.current;
    const json = JSON.stringify(snapshot);
    if (json === savedJson.current) {
      setStatus("saved");
      clearBackup(formId);
      return;
    }

    inFlight.current = true;
    setStatus("saving");
    try {
      const result = await saveDraft(formId, snapshot, revision.current);
      if (result.ok) {
        revision.current = result.data.revision;
        savedJson.current = json;
        attempt.current = 0;
        setErrorMessage(null);
        onSavedRef.current?.(result.data.revision);
        const stillDirty = JSON.stringify(latest.current) !== json;
        setStatus(stillDirty ? "unsaved" : "saved");
        if (stillDirty) queued.current = true;
        else clearBackup(formId);
      } else if (result.code === "conflict") {
        setStatus("conflict");
      } else {
        setStatus("error");
        setErrorMessage(result.error);
      }
    } catch {
      // Network failure: keep the local backup and retry with backoff.
      setStatus("offline");
      const delay = RETRY_DELAYS[Math.min(attempt.current, RETRY_DELAYS.length - 1)];
      attempt.current += 1;
      scheduleFlush(delay);
    } finally {
      inFlight.current = false;
      if (queued.current) {
        queued.current = false;
        scheduleFlush(DEBOUNCE_MS);
      }
    }
  }, [formId, scheduleFlush]);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  // Schedule a save whenever the document changes.
  React.useEffect(() => {
    if (JSON.stringify(doc) === savedJson.current) return;
    writeBackup(formId, doc);
    setStatus((current) => (current === "conflict" || current === "offline" ? current : "unsaved"));
    scheduleFlush(DEBOUNCE_MS);
  }, [doc, formId, scheduleFlush]);

  // Retry as soon as the connection is back; warn before leaving with unsaved work.
  React.useEffect(() => {
    const onOnline = () => void flush();
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (statusRef.current !== "saved") {
        event.preventDefault();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timer.current);
    };
  }, [flush]);

  /** After loading the latest version from the server. */
  const reset = React.useCallback(
    (nextDoc: FormDocument, nextRevision: number) => {
      revision.current = nextRevision;
      savedJson.current = JSON.stringify(nextDoc);
      clearBackup(formId);
      setStatus("saved");
      setErrorMessage(null);
    },
    [formId],
  );

  const currentRevision = React.useCallback(() => revision.current, []);

  return { status, errorMessage, flush, reset, currentRevision };
}
