"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronDown, Copy, GripHorizontal, Settings2, Trash2 } from "lucide-react";
import * as React from "react";

import { Switch, cx } from "@/components/aiesec";
import { Menu } from "@/components/app/Menu";
import { compatibleTypes, definitionOf } from "@/lib/forms/fields";
import { isChoiceField, isGridField, LIMITS, type Field } from "@/lib/forms/schema";

import { FIELD_ICONS } from "./fieldIcons";
import { FieldPreview } from "./FieldPreview";
import { InlineText } from "./InlineText";
import { LogicBadge } from "./LogicEditor";
import { OptionsEditor } from "./OptionsEditor";
import type { BuilderAction } from "./state";

type Props = {
  field: Field;
  number: number | null;
  pageId: string;
  selected: boolean;
  autoFocus: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dispatch: React.Dispatch<BuilderAction>;
  onDuplicate: (field: Field) => void;
  onDelete: (field: Field) => void;
  onOpenSettings: () => void;
  /** Plain-language rule for conditional questions, e.g. "Programme is “GV”". */
  logicLabel?: string | null;
};

const iconButton = "inline-flex size-10 items-center justify-center rounded-md text-text-muted hover:bg-fill hover:text-text disabled:cursor-not-allowed disabled:opacity-45";

export const FieldCard = React.memo(function FieldCard({ field, number, pageId, selected, autoFocus, canMoveUp, canMoveDown, dispatch, onDuplicate, onDelete, onOpenSettings, logicLabel }: Props) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: field.id, data: { pageId } });
  const definition = definitionOf(field.type);
  const Icon = FIELD_ICONS[field.type];
  const isStatement = field.type === "statement";
  const title = field.label.trim() || (isStatement ? "Text block" : "Untitled question");
  const update = (patch: Partial<Field>) => dispatch({ type: "updateField", id: field.id, patch });
  const select = () => {
    if (!selected) dispatch({ type: "select", id: field.id });
  };
  const choices = compatibleTypes(field.type);

  return (
    <article
      ref={setNodeRef}
      data-field-id={field.id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onPointerDown={select}
      onFocusCapture={select}
      className={cx(
        "group relative rounded-lg border bg-surface transition-[border-color,box-shadow] duration-150",
        selected ? "border-primary shadow-sm" : "border-border hover:border-border-strong",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${number ? `question ${number}` : "text block"}: ${title}`}
        className={cx(
          "absolute top-0 left-1/2 flex h-6 w-12 -translate-x-1/2 cursor-grab touch-none items-center justify-center rounded-b-md text-text-muted active:cursor-grabbing",
          selected ? "opacity-100" : "opacity-60 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100",
        )}
      >
        <GripHorizontal size={18} aria-hidden="true" />
      </button>

      {selected ? (
        <div className="flex flex-col gap-4 p-4 pt-6 sm:p-6 sm:pt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <InlineText
                value={field.label}
                onChange={(label) => update({ label })}
                label={isStatement ? "Heading" : `Question ${number ?? ""}`.trim()}
                placeholder={isStatement ? "Heading" : "Question"}
                autoFocus={autoFocus}
                maxLength={500}
                className="ae-h4"
              />
              <InlineText
                value={field.description}
                onChange={(description) => update({ description })}
                label="Description"
                placeholder={isStatement ? "Text" : "Description (optional)"}
                multiline
                maxLength={2000}
                className="ae-body-sm text-text-muted"
              />
              <LogicBadge text={logicLabel} />
            </div>
            {choices.length > 1 ? (
              <Menu
                label={`Question type: ${definition.name}. Change type`}
                align="end"
                triggerClassName="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-md border border-border-strong bg-surface px-3 ae-body-sm text-text hover:bg-fill"
                trigger={
                  <>
                    <Icon size={16} aria-hidden="true" />
                    {definition.name}
                    <ChevronDown size={16} aria-hidden="true" />
                  </>
                }
                items={choices.map((type) => {
                  const TypeIcon = FIELD_ICONS[type];
                  return { label: definitionOf(type).name, icon: <TypeIcon size={16} />, checked: type === field.type, onSelect: () => dispatch({ type: "changeType", id: field.id, fieldType: type }) };
                })}
              />
            ) : (
              <span className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-md bg-fill px-3 ae-body-sm text-text-muted">
                <Icon size={16} aria-hidden="true" />
                {definition.name}
              </span>
            )}
          </div>

          {isChoiceField(field) ? (
            <OptionsEditor
              options={field.options}
              onOptions={(options) => update({ options })}
              marker={field.type === "dropdown" ? "number" : field.type === "single_choice" ? "radio" : "checkbox"}
              allowOther={field.type !== "dropdown" && field.allowOther}
              onAllowOther={field.type === "dropdown" ? undefined : (allowOther) => update({ allowOther })}
            />
          ) : isGridField(field) ? (
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <h3 className="ae-label-sm text-text-muted uppercase">Rows</h3>
                <OptionsEditor options={field.rows} onOptions={(rows) => update({ rows })} marker="none" itemName="Row" max={LIMITS.gridRows} />
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="ae-label-sm text-text-muted uppercase">Columns</h3>
                <OptionsEditor options={field.columns} onOptions={(columns) => update({ columns })} marker={field.type === "choice_grid" ? "radio" : "checkbox"} itemName="Column" max={LIMITS.gridColumns} />
              </div>
            </div>
          ) : field.type === "consent" ? (
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="mt-1 inline-block size-4 shrink-0 rounded-sm border-2 border-border-strong" />
              <InlineText value={field.checkboxLabel} onChange={(checkboxLabel) => update({ checkboxLabel })} label="Checkbox text" placeholder="I agree" maxLength={500} className="ae-body" />
            </div>
          ) : (
            <FieldPreview field={field} />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex items-center">
              <button type="button" className={iconButton} aria-label="Move up" aria-keyshortcuts="Alt+ArrowUp" disabled={!canMoveUp} onClick={() => dispatch({ type: "moveFieldBy", id: field.id, delta: -1 })}>
                <ArrowUp size={18} aria-hidden="true" />
              </button>
              <button type="button" className={iconButton} aria-label="Move down" aria-keyshortcuts="Alt+ArrowDown" disabled={!canMoveDown} onClick={() => dispatch({ type: "moveFieldBy", id: field.id, delta: 1 })}>
                <ArrowDown size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className={iconButton} aria-label="Duplicate" aria-keyshortcuts="Control+D" onClick={() => onDuplicate(field)}>
                <Copy size={18} aria-hidden="true" />
              </button>
              <button type="button" className={cx(iconButton, "hover:text-danger-text")} aria-label="Delete" onClick={() => onDelete(field)}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
              {!isStatement && (
                <>
                  <button type="button" className={cx(iconButton, "lg:hidden")} aria-label="More options" onClick={onOpenSettings}>
                    <Settings2 size={18} aria-hidden="true" />
                  </button>
                  <span aria-hidden="true" className="mx-2 h-6 w-px bg-border" />
                  <Switch label="Required" checked={field.required} onChange={(event) => update({ required: event.target.checked })} />
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label={`Edit ${number ? `question ${number}` : "text block"}: ${title}`}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              dispatch({ type: "select", id: field.id });
            }
          }}
          className="flex cursor-pointer flex-col gap-3 rounded-lg p-4 pt-6 outline-none sm:p-6 sm:pt-7"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className={cx(isStatement ? "ae-h4" : "ae-label", field.label.trim() ? "text-text" : "text-text-muted")}>
                {title}
                {field.required && !isStatement && (
                  <>
                    <span aria-hidden="true" className="ml-1 text-danger-text">
                      *
                    </span>
                    <span className="sr-only"> (required)</span>
                  </>
                )}
              </p>
              {field.description && <p className="line-clamp-2 whitespace-pre-line ae-body-sm text-text-muted">{field.description}</p>}
              <LogicBadge text={logicLabel} />
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 ae-caption text-text-muted">
              <Icon size={14} aria-hidden="true" />
              <span className="hidden sm:inline">{definition.name}</span>
            </span>
          </div>
          <FieldPreview field={field} />
        </div>
      )}
    </article>
  );
});
