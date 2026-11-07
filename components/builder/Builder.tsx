"use client";

import { Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Alert, Button, cx, useToast } from "@/components/aiesec";
import { loadLatest } from "@/actions/builder";
import { publishForm } from "@/actions/publish";
import type { DestinationSummary } from "@/lib/destinations/types";
import { collectsAnswer } from "@/lib/forms/fields";
import type { PublishProblem } from "@/lib/forms/publish-checks";
import { allFields, type FieldType, type FormDocument } from "@/lib/forms/schema";

import { AddQuestionDialog } from "./AddQuestionDialog";
import { Canvas } from "./Canvas";
import { ConnectPanel } from "./connect/ConnectPanel";
import type { GoogleAccount } from "./connect/shared";
import { Inspector } from "./Inspector";
import { Palette } from "./Palette";
import { PreviewDialog } from "./PreviewDialog";
import { PublishProblemsDialog } from "./PublishProblemsDialog";
import { ResponseRules } from "./ResponseRules";
import { SettingsPanel } from "./SettingsPanel";
import { ShareDialog } from "./ShareDialog";
import { Sheet } from "./Sheet";
import { actions, builderReducer, findField, initialState, locateField } from "./state";
import { TopBar, type BuilderTab } from "./TopBar";
import { clearBackup, readBackup, useAutosave } from "./useAutosave";

export type BuilderForm = {
  id: string;
  slug: string;
  revision: number;
  publishedRevision: number | null;
  publishedAt: string | null;
  acceptingResponses: boolean;
  closesAt: string | null;
  responseLimit: number | null;
  responseCount: number;
  updatedAt: string;
  role: "owner" | "editor";
};

type Props = {
  form: BuilderForm;
  doc: FormDocument;
  publicBaseUrl: string;
  destinations: DestinationSummary[];
  googleConfigured: boolean;
  googleAccounts: GoogleAccount[];
  initialTab: BuilderTab;
  collaborators?: React.ReactNode;
};

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}

export function Builder({ form: initialForm, doc: initialDoc, publicBaseUrl, destinations: initialDestinations, googleConfigured, googleAccounts, initialTab, collaborators }: Props) {
  const toast = useToast();
  const pathname = usePathname();
  const [state, dispatch] = React.useReducer(builderReducer, initialDoc, initialState);
  const [form, setForm] = React.useState(initialForm);
  const [revision, setRevision] = React.useState(initialForm.revision);
  const [destinations, setDestinations] = React.useState(initialDestinations);
  const [tab, setTabState] = React.useState<BuilderTab>(initialTab);
  const [adding, setAdding] = React.useState<{ pageId: string | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [problems, setProblems] = React.useState<PublishProblem[] | null>(null);
  const [publishing, setPublishing] = React.useState(false);
  const [backup, setBackup] = React.useState<{ doc: FormDocument; savedAt: number } | null>(null);

  const autosave = useAutosave({ formId: form.id, doc: state.doc, initialDoc, initialRevision: initialForm.revision, onSaved: setRevision });
  const selected = findField(state.doc, state.selectedId);
  const fields = allFields(state.doc);
  const questionCount = fields.filter(collectsAnswer).length;
  const hasFileQuestions = fields.some((field) => field.type === "file_upload");
  const published = form.publishedAt !== null;
  const upToDate = published && form.publishedRevision === revision && autosave.status === "saved";
  const connectAttention = !destinations.some((destination) => destination.role === "primary") || destinations.some((destination) => destination.health === "failing") || (hasFileQuestions && !destinations.some((destination) => destination.role === "files"));

  // Offer unsaved work found on this device (e.g. the tab closed while offline).
  React.useEffect(() => {
    const found = readBackup(form.id);
    // localStorage only exists after hydration, so this read can't happen during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (found && found.savedAt > new Date(initialForm.updatedAt).getTime() && JSON.stringify(found.doc) !== JSON.stringify(initialDoc)) setBackup(found);
    else if (found) clearBackup(form.id);
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = React.useCallback(
    (next: BuilderTab) => {
      setTabState(next);
      window.history.replaceState(null, "", `${pathname}?tab=${next}`);
    },
    [pathname],
  );

  // A new question takes focus once and scrolls into view.
  React.useEffect(() => {
    if (!state.focusId) return;
    document.querySelector(`[data-field-id="${state.focusId}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const frame = requestAnimationFrame(() => dispatch({ type: "focused" }));
    return () => cancelAnimationFrame(frame);
  }, [state.focusId]);

  const addQuestion = React.useCallback(
    (type: FieldType, pageId?: string | null) => {
      setAdding(null);
      setTab("questions");
      const afterId = !pageId && state.selectedId ? state.selectedId : null;
      dispatch(actions.addField(type, afterId, pageId ?? null));
    },
    [setTab, state.selectedId],
  );

  const addPage = React.useCallback(() => {
    setAdding(null);
    dispatch(actions.addPage());
    toast.show({ title: "Page added", description: "Drag questions onto it, or add new ones." });
  }, [toast]);

  const duplicate = React.useCallback((field: Parameters<typeof actions.duplicateField>[0]) => dispatch(actions.duplicateField(field)), []);

  const remove = React.useCallback(
    (field: NonNullable<typeof selected>) => {
      const at = locateField(state.doc, field.id);
      if (!at) return;
      const pageId = state.doc.pages[at.pageIndex].id;
      dispatch({ type: "removeField", id: field.id });
      toast.show({
        title: "Question deleted",
        description: field.label || undefined,
        action: { label: "Undo", onClick: () => dispatch({ type: "addField", field, pageId, index: at.fieldIndex }) },
      });
    },
    [state.doc, toast],
  );

  // Keyboard shortcuts (shown in the inspector).
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if (mod && key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
        return;
      }
      if (mod && key === "s") {
        event.preventDefault();
        void autosave.flush();
        return;
      }
      if (tab !== "questions") return;
      if (mod && key === "d" && selected) {
        event.preventDefault();
        duplicate(selected);
        return;
      }
      if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && selected) {
        event.preventDefault();
        dispatch({ type: "moveFieldBy", id: selected.id, delta: event.key === "ArrowUp" ? -1 : 1 });
        return;
      }
      if (isTypingTarget(event.target)) {
        // Esc leaves the text field (the question stays selected), so shortcuts work again.
        if (event.key === "Escape") (event.target as HTMLElement).blur();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        setAdding({ pageId: null });
      } else if ((event.key === "Delete" || event.key === "Backspace") && selected) {
        event.preventDefault();
        remove(selected);
      } else if (event.key === "Escape" && selected) {
        dispatch({ type: "select", id: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave, duplicate, remove, selected, tab]);

  const publish = async () => {
    setPublishing(true);
    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await autosave.flush();
        const result = await publishForm(form.id, autosave.currentRevision());
        if (!result.ok) {
          toast.show({ tone: "danger", title: "Couldn't publish", description: result.error });
          return;
        }
        const outcome = result.data;
        if (outcome.status === "stale") {
          await new Promise((resolve) => setTimeout(resolve, 700));
          continue;
        }
        if (outcome.status === "problems") {
          setProblems(outcome.problems);
          return;
        }
        setForm((current) => ({ ...current, publishedAt: outcome.publishedAt, publishedRevision: outcome.publishedRevision }));
        const url = `${publicBaseUrl}/f/${form.slug}`;
        const copied = await navigator.clipboard.writeText(url).then(
          () => true,
          () => false,
        );
        toast.show({
          title: published ? "Changes published" : "Your form is live",
          description: [copied ? "Link copied." : null, ...outcome.warnings].filter(Boolean).join(" "),
        });
        if (!published) setShareOpen(true);
        return;
      }
      toast.show({ tone: "warning", title: "Still saving your changes", description: "Try publishing again in a moment." });
    } finally {
      setPublishing(false);
    }
  };

  const fix = (problem: PublishProblem) => {
    setProblems(null);
    setTab(problem.tab);
    if (problem.fieldId) {
      dispatch({ type: "select", id: problem.fieldId });
      requestAnimationFrame(() => document.querySelector(`[data-field-id="${problem.fieldId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
    }
  };

  const reloadLatest = async () => {
    const result = await loadLatest(form.id);
    if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't load the latest version", description: result.error });
    dispatch({ type: "replace", doc: result.data.doc });
    autosave.reset(result.data.doc, result.data.revision);
    setRevision(result.data.revision);
  };

  const publishLabel = !published ? "Publish" : upToDate ? "Published" : "Publish changes";
  const panelClass = "min-w-0 flex-1 overflow-y-auto bg-bg-subtle dark:bg-bg";

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <TopBar
        title={state.doc.title}
        status={autosave.status}
        tab={tab}
        onTab={setTab}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onPreview={() => setPreviewOpen(true)}
        onShare={() => setShareOpen(true)}
        onPublish={() => void publish()}
        publishLabel={publishLabel}
        publishDisabled={upToDate || publishing}
        publishing={publishing}
        connectAttention={connectAttention}
      />

      {(autosave.status === "conflict" || autosave.status === "error" || backup) && (
        <div className="shrink-0 border-b border-border bg-bg px-4 py-3">
          {autosave.status === "conflict" ? (
            <Alert tone="warning" title="This form was changed somewhere else" actions={<Button size="sm" variant="primary" onClick={() => void reloadLatest()}>Load latest version</Button>}>
              Another editor (or another tab) saved changes. Load the latest version to keep editing.
            </Alert>
          ) : autosave.status === "error" ? (
            <Alert tone="danger" title="Your last change wasn't saved">
              {autosave.errorMessage}
            </Alert>
          ) : backup ? (
            <Alert
              tone="info"
              title="Unsaved changes found on this device"
              onDismiss={() => {
                clearBackup(form.id);
                setBackup(null);
              }}
              actions={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    dispatch({ type: "replace", doc: backup.doc });
                    setBackup(null);
                  }}
                >
                  Restore them
                </Button>
              }
            >
              They weren&apos;t saved before this page was closed.
            </Alert>
          ) : null}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {tab === "questions" && (
          <>
            <aside aria-label="Question types" className="hidden w-60 shrink-0 overflow-y-auto border-r border-border bg-bg lg:block">
              <Palette onPick={(type) => addQuestion(type)} onAddPage={addPage} />
            </aside>
            <main id="panel-questions" role="tabpanel" aria-labelledby="tab-questions" className={panelClass}>
              <Canvas
                state={state}
                dispatch={dispatch}
                onAddQuestion={(pageId) => setAdding({ pageId })}
                onAddPage={addPage}
                onDuplicate={duplicate}
                onDelete={remove}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </main>
            <aside aria-label="Question settings" className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-bg lg:block">
              <Inspector field={selected} onChange={(patch) => selected && dispatch({ type: "updateField", id: selected.id, patch })} questionCount={questionCount} pageCount={state.doc.pages.length} />
            </aside>
          </>
        )}
        {tab === "connect" && (
          <main id="panel-connect" role="tabpanel" aria-labelledby="tab-connect" className={panelClass}>
            <ConnectPanel formId={form.id} destinations={destinations} onDestinations={setDestinations} googleConfigured={googleConfigured} googleAccounts={googleAccounts} hasFileQuestions={hasFileQuestions} />
          </main>
        )}
        {tab === "settings" && (
          <main id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" className={panelClass}>
            <SettingsPanel doc={state.doc} onSettings={(patch) => dispatch({ type: "updateSettings", patch })} onTheme={(patch) => dispatch({ type: "updateTheme", patch })}>
              {published && (
                <ResponseRules
                  formId={form.id}
                  acceptingResponses={form.acceptingResponses}
                  closesAt={form.closesAt}
                  responseLimit={form.responseLimit}
                  responseCount={form.responseCount}
                  onChange={(rules) => setForm((current) => ({ ...current, ...rules }))}
                />
              )}
              {collaborators}
            </SettingsPanel>
          </main>
        )}
      </div>

      {tab === "questions" && (
        <button
          type="button"
          onClick={() => setAdding({ pageId: null })}
          className={cx("ae-btn ae-btn--primary ae-btn--lg ae-body fixed right-4 bottom-4 z-[1100] shadow-lg lg:hidden", "pb-[env(safe-area-inset-bottom)]")}
        >
          <Plus size={20} aria-hidden="true" />
          Add question
        </button>
      )}

      <AddQuestionDialog open={adding !== null} onClose={() => setAdding(null)} onPick={(type) => addQuestion(type, adding?.pageId)} onAddPage={addPage} />
      <Sheet open={settingsOpen && selected !== null} onClose={() => setSettingsOpen(false)} title="Question settings">
        {selected && <Inspector field={selected} onChange={(patch) => dispatch({ type: "updateField", id: selected.id, patch })} questionCount={questionCount} pageCount={state.doc.pages.length} />}
      </Sheet>
      <PreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} doc={state.doc} />
      <PublishProblemsDialog problems={problems} onClose={() => setProblems(null)} onFix={fix} />
      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        formId={form.id}
        title={state.doc.title}
        slug={form.slug}
        onSlug={(slug) => setForm((current) => ({ ...current, slug }))}
        published={published}
        acceptingResponses={form.acceptingResponses}
        onAccepting={(acceptingResponses) => setForm((current) => ({ ...current, acceptingResponses }))}
        publicBaseUrl={publicBaseUrl}
        onPublish={() => {
          setShareOpen(false);
          void publish();
        }}
      />
    </div>
  );
}
