import { convertField, createField } from "@/lib/forms/fields";
import { newId } from "@/lib/forms/ids";
import type { Field, FieldType, FormDocument, FormSettings, FormTheme, Page } from "@/lib/forms/schema";

// Builder state: the document plus selection and undo history. Pure reducer:
// ids are created by the action helpers below, never inside the reducer.

export type BuilderState = {
  doc: FormDocument;
  selectedId: string | null;
  /** A field just added: its label input takes focus once. */
  focusId: string | null;
  past: FormDocument[];
  future: FormDocument[];
  lastKey: string | null;
  lastAt: number;
};

export type BuilderAction =
  | { type: "replace"; doc: FormDocument }
  | { type: "select"; id: string | null }
  | { type: "focused" }
  | { type: "updateForm"; patch: Partial<Pick<FormDocument, "title" | "description">> }
  | { type: "updateSettings"; patch: Partial<FormSettings> }
  | { type: "updateTheme"; patch: Partial<FormTheme> }
  | { type: "addField"; field: Field; afterId?: string | null; pageId?: string | null; index?: number }
  | { type: "updateField"; id: string; patch: Partial<Field> }
  | { type: "changeType"; id: string; fieldType: FieldType }
  | { type: "duplicateField"; id: string; copy: Field }
  | { type: "removeField"; id: string }
  | { type: "moveField"; id: string; toPageId: string; toIndex: number }
  | { type: "moveFieldBy"; id: string; delta: -1 | 1 }
  | { type: "addPage"; page: Page; afterPageId?: string | null }
  | { type: "updatePage"; id: string; patch: Partial<Pick<Page, "title" | "description">> }
  | { type: "removePage"; id: string }
  | { type: "undo" }
  | { type: "redo" };

export const HISTORY_LIMIT = 100;
/** Edits to the same property within this window undo as one step (typing). */
export const GROUP_WINDOW_MS = 800;

export function initialState(doc: FormDocument): BuilderState {
  return { doc, selectedId: null, focusId: null, past: [], future: [], lastKey: null, lastAt: 0 };
}

export function locateField(doc: FormDocument, fieldId: string): { pageIndex: number; fieldIndex: number } | null {
  for (let pageIndex = 0; pageIndex < doc.pages.length; pageIndex += 1) {
    const fieldIndex = doc.pages[pageIndex].fields.findIndex((field) => field.id === fieldId);
    if (fieldIndex !== -1) return { pageIndex, fieldIndex };
  }
  return null;
}

export function findField(doc: FormDocument, fieldId: string | null): Field | null {
  if (!fieldId) return null;
  const at = locateField(doc, fieldId);
  return at ? doc.pages[at.pageIndex].fields[at.fieldIndex] : null;
}

function withPages(doc: FormDocument, pages: Page[]): FormDocument {
  return { ...doc, pages };
}

function setFields(doc: FormDocument, pageIndex: number, fields: Field[]): FormDocument {
  return withPages(
    doc,
    doc.pages.map((page, index) => (index === pageIndex ? { ...page, fields } : page)),
  );
}

function commit(state: BuilderState, doc: FormDocument, key: string | null, extra: Partial<BuilderState> = {}): BuilderState {
  if (doc === state.doc) return { ...state, ...extra };
  const now = Date.now();
  const grouped = key !== null && key === state.lastKey && now - state.lastAt < GROUP_WINDOW_MS;
  return {
    ...state,
    ...extra,
    doc,
    past: grouped ? state.past : [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

function keepSelection(doc: FormDocument, id: string | null): string | null {
  return id && locateField(doc, id) ? id : null;
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  const { doc } = state;
  switch (action.type) {
    case "replace":
      return { ...initialState(action.doc), selectedId: keepSelection(action.doc, state.selectedId) };

    case "select":
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id, lastKey: null };

    case "focused":
      return state.focusId === null ? state : { ...state, focusId: null };

    case "updateForm":
      return commit(state, { ...doc, ...action.patch }, `form:${Object.keys(action.patch).sort().join(",")}`);

    case "updateSettings":
      return commit(state, { ...doc, settings: { ...doc.settings, ...action.patch } }, `settings:${Object.keys(action.patch).sort().join(",")}`);

    case "updateTheme":
      return commit(state, { ...doc, theme: { ...doc.theme, ...action.patch } }, null);

    case "addField": {
      const anchor = action.afterId ? locateField(doc, action.afterId) : null;
      let pageIndex: number;
      let insertAt: number;
      if (anchor) {
        pageIndex = anchor.pageIndex;
        insertAt = anchor.fieldIndex + 1;
      } else {
        const requested = action.pageId ? doc.pages.findIndex((page) => page.id === action.pageId) : -1;
        pageIndex = requested === -1 ? doc.pages.length - 1 : requested;
        const length = doc.pages[pageIndex].fields.length;
        insertAt = requested !== -1 && action.index !== undefined ? Math.max(0, Math.min(action.index, length)) : length;
      }
      const fields = [...doc.pages[pageIndex].fields];
      fields.splice(insertAt, 0, action.field);
      return commit(state, setFields(doc, pageIndex, fields), null, { selectedId: action.field.id, focusId: action.field.id });
    }

    case "updateField": {
      const at = locateField(doc, action.id);
      if (!at) return state;
      const fields = doc.pages[at.pageIndex].fields.map((field) => (field.id === action.id ? ({ ...field, ...action.patch, id: field.id, type: field.type } as Field) : field));
      return commit(state, setFields(doc, at.pageIndex, fields), `field:${action.id}:${Object.keys(action.patch).sort().join(",")}`);
    }

    case "changeType": {
      const at = locateField(doc, action.id);
      if (!at) return state;
      const fields = doc.pages[at.pageIndex].fields.map((field) => (field.id === action.id ? convertField(field, action.fieldType) : field));
      return commit(state, setFields(doc, at.pageIndex, fields), null);
    }

    case "duplicateField": {
      const at = locateField(doc, action.id);
      if (!at) return state;
      const fields = [...doc.pages[at.pageIndex].fields];
      fields.splice(at.fieldIndex + 1, 0, action.copy);
      return commit(state, setFields(doc, at.pageIndex, fields), null, { selectedId: action.copy.id, focusId: action.copy.id });
    }

    case "removeField": {
      const at = locateField(doc, action.id);
      if (!at) return state;
      const pageFields = doc.pages[at.pageIndex].fields;
      const neighbour = pageFields[at.fieldIndex + 1] ?? pageFields[at.fieldIndex - 1] ?? null;
      const fields = pageFields.filter((field) => field.id !== action.id);
      return commit(state, setFields(doc, at.pageIndex, fields), null, {
        selectedId: state.selectedId === action.id ? (neighbour?.id ?? null) : state.selectedId,
      });
    }

    case "moveField": {
      const at = locateField(doc, action.id);
      const targetIndex = doc.pages.findIndex((page) => page.id === action.toPageId);
      if (!at || targetIndex === -1) return state;
      const field = doc.pages[at.pageIndex].fields[at.fieldIndex];
      const pages = doc.pages.map((page) => ({ ...page, fields: page.fields.filter((item) => item.id !== action.id) }));
      const target = [...pages[targetIndex].fields];
      target.splice(Math.max(0, Math.min(action.toIndex, target.length)), 0, field);
      pages[targetIndex] = { ...pages[targetIndex], fields: target };
      const next = withPages(doc, pages);
      return JSON.stringify(next.pages.map((page) => page.fields.map((item) => item.id))) === JSON.stringify(doc.pages.map((page) => page.fields.map((item) => item.id)))
        ? state
        : commit(state, next, null);
    }

    case "moveFieldBy": {
      const at = locateField(doc, action.id);
      if (!at) return state;
      const pageFields = doc.pages[at.pageIndex].fields;
      const targetIndex = at.fieldIndex + action.delta;
      if (targetIndex >= 0 && targetIndex < pageFields.length) {
        return builderReducer(state, { type: "moveField", id: action.id, toPageId: doc.pages[at.pageIndex].id, toIndex: targetIndex });
      }
      // Cross into the neighbouring page.
      const neighbour = doc.pages[at.pageIndex + action.delta];
      if (!neighbour) return state;
      return builderReducer(state, { type: "moveField", id: action.id, toPageId: neighbour.id, toIndex: action.delta === 1 ? 0 : neighbour.fields.length });
    }

    case "addPage": {
      const afterIndex = action.afterPageId ? doc.pages.findIndex((page) => page.id === action.afterPageId) : doc.pages.length - 1;
      const pages = [...doc.pages];
      pages.splice((afterIndex === -1 ? pages.length - 1 : afterIndex) + 1, 0, action.page);
      return commit(state, withPages(doc, pages), null);
    }

    case "updatePage": {
      const pages = doc.pages.map((page) => (page.id === action.id ? { ...page, ...action.patch } : page));
      return commit(state, withPages(doc, pages), `page:${action.id}:${Object.keys(action.patch).sort().join(",")}`);
    }

    case "removePage": {
      if (doc.pages.length <= 1) return state;
      const index = doc.pages.findIndex((page) => page.id === action.id);
      if (index === -1) return state;
      // Questions on the removed page join the previous page (or the next one for the first page).
      const intoIndex = index === 0 ? 1 : index - 1;
      const moved = doc.pages[index].fields;
      const pages = doc.pages
        .map((page, position) => {
          if (position !== intoIndex) return page;
          return { ...page, fields: index === 0 ? [...moved, ...page.fields] : [...page.fields, ...moved] };
        })
        .filter((_, position) => position !== index);
      return commit(state, withPages(doc, pages), null);
    }

    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        selectedId: keepSelection(previous, state.selectedId),
        lastKey: null,
      };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        selectedId: keepSelection(next, state.selectedId),
        lastKey: null,
      };
    }
  }
}

// --- Action helpers (create ids outside the reducer) --------------------------

export const actions = {
  addField: (fieldType: FieldType, afterId?: string | null, pageId?: string | null): BuilderAction => ({ type: "addField", field: createField(fieldType), afterId, pageId }),
  duplicateField: (field: Field): BuilderAction => {
    const copy = (
      "options" in field
        ? { ...field, id: newId("f"), options: field.options.map((option) => ({ ...option, id: newId("o") })) }
        : { ...field, id: newId("f") }
    ) as Field;
    return { type: "duplicateField", id: field.id, copy };
  },
  addPage: (afterPageId?: string | null): BuilderAction => ({ type: "addPage", page: { id: newId("p"), title: "", description: "", fields: [] }, afterPageId }),
};
