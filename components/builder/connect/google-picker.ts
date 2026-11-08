"use client";

// Google Picker (ADR-016): the owner chooses a Sheet or folder in Google's own
// chooser, from My Drive or a shared drive; with drive.file, whatever they pick
// becomes accessible to us.

type PickerDoc = { id: string; name: string };
type PickerResponse = { action: string; docs?: PickerDoc[] };

interface DocsView {
  setIncludeFolders(value: boolean): DocsView;
  setSelectFolderEnabled(value: boolean): DocsView;
  setMimeTypes(mimeTypes: string): DocsView;
  setMode(mode: unknown): DocsView;
  /** Shows shared drives and their files. */
  setEnableDrives(value: boolean): DocsView;
  /** Tab name in the chooser (newer Picker versions). */
  setLabel?(label: string): DocsView;
}

interface Picker {
  setVisible(value: boolean): void;
  dispose(): void;
}

interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  enableFeature(feature: unknown): PickerBuilder;
  setCallback(callback: (data: PickerResponse) => void): PickerBuilder;
  build(): Picker;
}

interface PickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: unknown) => DocsView;
  ViewId: { FOLDERS: unknown; SPREADSHEETS: unknown };
  DocsViewMode: { LIST: unknown };
  Action: { PICKED: string; CANCEL: string };
}

type LoadOptions = { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void };
type PickerWindow = Window & { gapi?: { load(name: string, options: LoadOptions): void }; google?: { picker?: PickerApi } };

export type PickerSession = { token: string; apiKey: string; appId: string };
export type PickedFile = { id: string; name: string };

const FOLDER_MIME = "application/vnd.google-apps.folder";
let loading: Promise<PickerApi> | null = null;

function loadPicker(): Promise<PickerApi> {
  const win = window as PickerWindow;
  if (win.google?.picker) return Promise.resolve(win.google.picker);
  loading ??= new Promise<PickerApi>((resolve, reject) => {
    const failed = () => {
      loading = null;
      reject(new Error("Google's file chooser didn't load. Check your connection and try again."));
    };
    const ready = () =>
      win.gapi?.load("picker", {
        callback: () => (win.google?.picker ? resolve(win.google.picker) : failed()),
        onerror: failed,
        timeout: 15_000,
        ontimeout: failed,
      });
    if (win.gapi) return ready();
    // Added by our own (nonce-trusted) code, so CSP 'strict-dynamic' allows it.
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = ready;
    script.onerror = failed;
    document.head.append(script);
  });
  return loading;
}

/** Opens Google's chooser; resolves with the picked file, or null if the person closed it. */
export async function pickFromDrive(session: PickerSession, kind: "folder" | "spreadsheet"): Promise<PickedFile | null> {
  const api = await loadPicker();
  return new Promise((resolve) => {
    // Two tabs: the person's own Drive, and the shared drives they belong to.
    const view = (sharedDrives: boolean) => {
      const base = kind === "folder" ? new api.DocsView(api.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(FOLDER_MIME) : new api.DocsView(api.ViewId.SPREADSHEETS).setMode(api.DocsViewMode.LIST);
      const scoped = sharedDrives ? base.setEnableDrives(true) : base;
      return scoped.setLabel?.(sharedDrives ? "Shared drives" : "My Drive") ?? scoped;
    };
    const picker = new api.PickerBuilder()
      .addView(view(false))
      .addView(view(true))
      .setOAuthToken(session.token)
      .setDeveloperKey(session.apiKey)
      .setAppId(session.appId)
      .setOrigin(window.location.origin)
      .setTitle(kind === "folder" ? "Choose where the AIESEC Forms folder goes" : "Choose a Sheet")
      .setCallback((data) => {
        if (data.action !== api.Action.PICKED && data.action !== api.Action.CANCEL) return;
        const doc = data.action === api.Action.PICKED ? data.docs?.[0] : undefined;
        picker.dispose();
        resolve(doc ? { id: doc.id, name: doc.name } : null);
      })
      .build();
    picker.setVisible(true);
  });
}

/**
 * Google's chooser lives on the page, under any open modal <dialog>: close the
 * dialog while it's up and bring it back afterwards.
 */
export async function withDialogHidden<T>(inside: Element | null, run: () => Promise<T>): Promise<T> {
  const dialog = inside?.closest("dialog") ?? null;
  const wasOpen = Boolean(dialog?.open);
  if (wasOpen) dialog?.close();
  try {
    return await run();
  } finally {
    if (wasOpen && dialog && !dialog.open && dialog.isConnected) dialog.showModal();
  }
}
