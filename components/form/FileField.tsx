"use client";

import { FileText, RotateCcw, Upload, X } from "lucide-react";
import * as React from "react";

import { cx, Progress } from "@/components/aiesec";
import type { FileAnswer } from "@/lib/forms/fields";
import { bytesFromMb, FILE_KIND_ACCEPT, FILE_KIND_LABEL, fileTypeAllowed } from "@/lib/forms/fields/other";
import type { FieldOf } from "@/lib/forms/schema";

// Uploads go straight from the browser to the owner's Google Drive through a
// resumable session our server opens (ADR-004). Nothing passes through us.

export type UploadContext = {
  mode: "live" | "embed" | "preview";
  slug?: string;
  /** The submission's response id (created on first use). */
  responseId: () => string;
  onBusyChange: (fieldId: string, busy: boolean) => void;
};

type Item = {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  progress: number;
  status: "uploading" | "done" | "error";
  fileId?: string;
  error?: string;
  file?: File;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function asFiles(value: unknown): FileAnswer[] {
  return Array.isArray(value) ? (value as FileAnswer[]) : [];
}

export function FileField({ field, value, onChange, describedBy, upload }: { field: FieldOf<"file_upload">; value: unknown; onChange: (value: unknown) => void; describedBy?: string; upload: UploadContext }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const requests = React.useRef(new Map<string, XMLHttpRequest>());
  const [items, setItems] = React.useState<Item[]>(() => asFiles(value).map((file) => ({ key: file.fileId, name: file.name, size: file.size, mimeType: file.mimeType, progress: 100, status: "done", fileId: file.fileId })));
  const [dragging, setDragging] = React.useState(false);
  const accept = field.accept.length ? field.accept.map((kind) => FILE_KIND_ACCEPT[kind]).join(",") : undefined;
  const limit = bytesFromMb(field.maxSizeMb);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Report finished uploads as the answer, and whether any are still running.
  React.useEffect(() => {
    const done = items.filter((item) => item.status === "done" && item.fileId).map((item) => ({ fileId: item.fileId as string, name: item.name, size: item.size, mimeType: item.mimeType }));
    onChangeRef.current(done.length ? done : null);
    upload.onBusyChange(field.id, items.some((item) => item.status === "uploading"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  React.useEffect(() => () => requests.current.forEach((xhr) => xhr.abort()), []);

  const patch = (key: string, change: Partial<Item>) => setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));

  const start = async (item: Item) => {
    const file = item.file;
    if (!file) return;
    if (upload.mode === "preview") {
      // Preview: pretend, so owners can try the flow without sending files anywhere.
      patch(item.key, { status: "done", progress: 100, fileId: `preview${item.key.replace(/[^A-Za-z0-9]/g, "").slice(0, 20).padEnd(10, "0")}` });
      return;
    }
    patch(item.key, { status: "uploading", progress: 0, error: undefined });
    try {
      const response = await fetch(`/api/f/${upload.slug}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldId: field.id, responseId: upload.responseId(), name: item.name, size: item.size, mimeType: item.mimeType }),
      });
      const body = (await response.json().catch(() => ({}))) as { uploadUrl?: string; message?: string };
      if (!response.ok || !body.uploadUrl) throw new Error(body.message ?? "We couldn't start the upload.");

      const fileId = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        requests.current.set(item.key, xhr);
        xhr.open("PUT", body.uploadUrl as string);
        xhr.setRequestHeader("Content-Type", item.mimeType);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) patch(item.key, { progress: Math.round((event.loaded / event.total) * 100) });
        };
        xhr.onload = () => {
          requests.current.delete(item.key);
          try {
            const uploaded = JSON.parse(xhr.responseText) as { id?: string };
            if (xhr.status >= 200 && xhr.status < 300 && uploaded.id) resolve(uploaded.id);
            else reject(new Error("The upload didn't finish."));
          } catch {
            reject(new Error("The upload didn't finish."));
          }
        };
        xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
        xhr.onabort = () => reject(new Error("Upload cancelled."));
        xhr.send(file);
      });
      patch(item.key, { status: "done", progress: 100, fileId });
    } catch (error) {
      patch(item.key, { status: "error", error: error instanceof Error ? error.message : "The upload failed." });
    }
  };

  const add = (files: FileList | File[]) => {
    const room = field.maxFiles - items.filter((item) => item.status !== "error").length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    const next: Item[] = chosen.map((file) => {
      const mimeType = file.type || "application/octet-stream";
      const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const problem = file.size > limit ? `This file is over ${field.maxSizeMb} MB.` : !fileTypeAllowed(field.accept, mimeType) ? "This file type isn't accepted here." : undefined;
      return { key, name: file.name.slice(0, 255), size: file.size, mimeType, progress: 0, status: problem ? "error" : "uploading", error: problem, file: problem ? undefined : file };
    });
    setItems((list) => [...list, ...next]);
    next.filter((item) => item.status === "uploading").forEach((item) => void start(item));
  };

  const remove = (key: string) => {
    requests.current.get(key)?.abort();
    requests.current.delete(key);
    setItems((list) => list.filter((item) => item.key !== key));
  };

  const full = items.filter((item) => item.status !== "error").length >= field.maxFiles;
  const kinds = field.accept.map((kind) => FILE_KIND_LABEL[kind]).join(", ");

  return (
    <div className="flex flex-col gap-3">
      {!full && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            add(event.dataTransfer.files);
          }}
          className={cx("rounded-lg border-2 border-dashed p-5 transition-colors duration-150", dragging ? "border-primary bg-primary-soft" : "border-border-strong")}
        >
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            id={`q-${field.id}-file`}
            accept={accept}
            multiple={field.maxFiles > 1}
            aria-describedby={describedBy}
            onChange={(event) => {
              if (event.target.files) add(event.target.files);
              event.target.value = "";
            }}
          />
          <label htmlFor={`q-${field.id}-file`} className="flex cursor-pointer flex-col items-center gap-2 text-center has-[:focus-visible]:outline-2">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary-text">
              <Upload size={20} aria-hidden="true" />
            </span>
            <span className="ae-label text-primary-text">{field.maxFiles > 1 ? "Choose files" : "Choose a file"}</span>
            <span className="ae-body-sm text-text-muted">
              {kinds ? `${kinds} · ` : ""}up to {field.maxSizeMb} MB{field.maxFiles > 1 ? ` each · up to ${field.maxFiles} files` : ""}
            </span>
          </label>
        </div>
      )}
      {items.length > 0 && (
        <ul role="list" className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
              <FileText size={20} aria-hidden="true" className="shrink-0 text-text-muted" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate ae-body-sm text-text">{item.name}</span>
                {item.status === "uploading" ? (
                  <Progress label={`Uploading ${item.name}`} hideLabel value={item.progress} size="sm" />
                ) : item.status === "error" ? (
                  <span className="ae-caption font-bold text-danger-text">{item.error}</span>
                ) : (
                  <span className="ae-caption text-text-muted">{formatBytes(item.size)} · Uploaded</span>
                )}
              </div>
              {item.status === "error" && item.file && (
                <button type="button" onClick={() => void start(item)} className="ae-close" aria-label={`Retry uploading ${item.name}`}>
                  <RotateCcw size={18} aria-hidden="true" />
                </button>
              )}
              <button type="button" onClick={() => remove(item.key)} className="ae-close" aria-label={`Remove ${item.name}`}>
                <X size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
