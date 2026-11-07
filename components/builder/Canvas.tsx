"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { FilePlus2, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";
import { collectsAnswer } from "@/lib/forms/fields";
import type { Field, FormDocument, Page } from "@/lib/forms/schema";

import { FieldCard } from "./FieldCard";
import { InlineText } from "./InlineText";
import { locateField, type BuilderAction, type BuilderState } from "./state";

type Props = {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
  onAddQuestion: (pageId: string) => void;
  onAddPage: () => void;
  onDuplicate: (field: Field) => void;
  onDelete: (field: Field) => void;
  onOpenSettings: () => void;
};

function questionNumbers(doc: FormDocument): Map<string, number> {
  const numbers = new Map<string, number>();
  let count = 0;
  for (const page of doc.pages) {
    for (const field of page.fields) {
      if (collectsAnswer(field)) numbers.set(field.id, ++count);
    }
  }
  return numbers;
}

function PageDropZone({ page, children }: { page: Page; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: page.id });
  return (
    <div ref={setNodeRef} className={cx("flex flex-col gap-3 rounded-lg", isOver && page.fields.length === 0 && "bg-primary-soft")}>
      {children}
    </div>
  );
}

export function Canvas({ state, dispatch, onAddQuestion, onAddPage, onDuplicate, onDelete, onOpenSettings }: Props) {
  const { doc, selectedId, focusId } = state;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const numbers = React.useMemo(() => questionNumbers(doc), [doc]);
  const flat = React.useMemo(() => doc.pages.flatMap((page) => page.fields.map((field) => field.id)), [doc]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const overId = String(over.id);
    const target = locateField(doc, overId);
    if (target) {
      dispatch({ type: "moveField", id: String(active.id), toPageId: doc.pages[target.pageIndex].id, toIndex: target.fieldIndex });
      return;
    }
    const page = doc.pages.find((item) => item.id === overId);
    if (page) dispatch({ type: "moveField", id: String(active.id), toPageId: page.id, toIndex: page.fields.length });
  };

  const multiPage = doc.pages.length > 1;

  return (
    // Extra bottom space on phones so the floating "Add question" button never covers content.
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 pt-6 pb-28 sm:px-6 lg:py-10" onPointerDown={(event) => {
      // A click on empty canvas space clears the selection.
      if (event.target === event.currentTarget) dispatch({ type: "select", id: null });
    }}>
      <section aria-label="Form title and description" data-program={doc.theme.accent} className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="h-2 bg-accent" aria-hidden="true" />
        <div className="flex flex-col gap-2 p-4 sm:p-6">
          <InlineText value={doc.title} onChange={(title) => dispatch({ type: "updateForm", patch: { title } })} label="Form title" placeholder="Untitled form" maxLength={200} className="ae-h2" />
          <InlineText
            value={doc.description}
            onChange={(description) => dispatch({ type: "updateForm", patch: { description } })}
            label="Form description"
            placeholder="Add a description (optional)"
            multiline
            maxLength={4000}
            className="ae-body text-text-muted"
          />
        </div>
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {doc.pages.map((page, pageIndex) => (
          <section key={page.id} aria-label={multiPage ? `Page ${pageIndex + 1}` : "Questions"} className="flex flex-col gap-3">
            {multiPage && (
              <>
                <div className="flex items-center gap-3 pt-6">
                  <span className="ae-label-sm text-text-muted uppercase">
                    Page {pageIndex + 1} of {doc.pages.length}
                  </span>
                  <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "removePage", id: page.id })}
                    aria-label={`Remove page ${pageIndex + 1} (its questions stay)`}
                    className="inline-flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-bg-subtle hover:text-danger-text"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
                <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 sm:px-6">
                  <InlineText value={page.title} onChange={(title) => dispatch({ type: "updatePage", id: page.id, patch: { title } })} label={`Page ${pageIndex + 1} title`} placeholder="Page title (optional)" maxLength={300} className="ae-h4" />
                  <InlineText
                    value={page.description}
                    onChange={(description) => dispatch({ type: "updatePage", id: page.id, patch: { description } })}
                    label={`Page ${pageIndex + 1} description`}
                    placeholder="Page description (optional)"
                    multiline
                    maxLength={2000}
                    className="ae-body-sm text-text-muted"
                  />
                </div>
              </>
            )}
            <SortableContext items={page.fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
              <PageDropZone page={page}>
                {page.fields.length === 0 && (
                  <p className="rounded-lg border-2 border-dashed border-border px-4 py-8 text-center ae-body-sm text-text-muted">This page is empty. Add a question or drag one here.</p>
                )}
                {page.fields.map((field) => {
                  const position = flat.indexOf(field.id);
                  return (
                    <FieldCard
                      key={field.id}
                      field={field}
                      number={numbers.get(field.id) ?? null}
                      pageId={page.id}
                      selected={field.id === selectedId}
                      autoFocus={field.id === focusId}
                      canMoveUp={position > 0}
                      canMoveDown={position < flat.length - 1}
                      dispatch={dispatch}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                      onOpenSettings={onOpenSettings}
                    />
                  );
                })}
              </PageDropZone>
            </SortableContext>
            <button
              type="button"
              onClick={() => onAddQuestion(page.id)}
              className="flex h-12 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border ae-label text-text-muted transition-colors duration-150 hover:border-primary hover:bg-primary-soft hover:text-primary-text"
            >
              <Plus size={18} aria-hidden="true" />
              Add question{multiPage ? ` to page ${pageIndex + 1}` : ""}
            </button>
          </section>
        ))}
      </DndContext>

      <button type="button" onClick={onAddPage} className="mt-2 inline-flex h-10 items-center gap-2 self-center rounded-md px-3 ae-body-sm text-text-muted hover:bg-bg-subtle hover:text-text">
        <FilePlus2 size={16} aria-hidden="true" />
        Add a page
      </button>
    </div>
  );
}
