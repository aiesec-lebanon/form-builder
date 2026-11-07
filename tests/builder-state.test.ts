import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { actions, builderReducer, findField, GROUP_WINDOW_MS, initialState, type BuilderState } from "@/components/builder/state";
import { createField } from "@/lib/forms/fields";
import type { FieldOf } from "@/lib/forms/schema";
import { blankDocument, templateDocument } from "@/lib/forms/templates";

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

const ids = (state: BuilderState) => state.doc.pages.map((page) => page.fields.map((field) => field.id));
const run = (state: BuilderState, ...list: Parameters<typeof builderReducer>[1][]) => list.reduce(builderReducer, state);

describe("builder reducer", () => {
  it("adds after the selected field, selects it and asks for focus", () => {
    const start = initialState(blankDocument());
    const first = start.doc.pages[0].fields[0].id;
    const add = actions.addField("email", first);
    const next = builderReducer(start, add);
    const added = add.type === "addField" ? add.field.id : "";
    expect(ids(next)[0]).toEqual([first, added]);
    expect(next.selectedId).toBe(added);
    expect(next.focusId).toBe(added);
    expect(builderReducer(next, { type: "focused" }).focusId).toBeNull();
  });

  it("groups rapid edits to the same property into one undo step", () => {
    const start = initialState(blankDocument());
    const id = start.doc.pages[0].fields[0].id;
    let state = run(start, { type: "updateField", id, patch: { label: "N" } });
    now += 100;
    state = run(state, { type: "updateField", id, patch: { label: "Na" } });
    now += 100;
    state = run(state, { type: "updateField", id, patch: { label: "Name" } });
    expect(state.past).toHaveLength(1);
    now += GROUP_WINDOW_MS + 1;
    state = run(state, { type: "updateField", id, patch: { label: "Name?" } });
    expect(state.past).toHaveLength(2);

    const undone = run(state, { type: "undo" });
    expect(findField(undone.doc, id)?.label).toBe("Name");
    const undoneTwice = run(undone, { type: "undo" });
    expect(findField(undoneTwice.doc, id)?.label).toBe("");
    expect(findField(run(undoneTwice, { type: "redo" }, { type: "redo" }).doc, id)?.label).toBe("Name?");
  });

  it("never lets an update change a field's id or type", () => {
    const start = initialState(blankDocument());
    const id = start.doc.pages[0].fields[0].id;
    const next = run(start, { type: "updateField", id, patch: { id: "f_hijacked", type: "email" } as never });
    expect(findField(next.doc, id)?.type).toBe("short_text");
  });

  it("moves fields with the keyboard across page boundaries", () => {
    let state = initialState(templateDocument("membership"));
    const lastOfFirstPage = state.doc.pages[0].fields.at(-1)!.id;
    state = run(state, { type: "moveFieldBy", id: lastOfFirstPage, delta: 1 });
    expect(state.doc.pages[1].fields[0].id).toBe(lastOfFirstPage);
    state = run(state, { type: "moveFieldBy", id: lastOfFirstPage, delta: -1 });
    expect(state.doc.pages[0].fields.at(-1)!.id).toBe(lastOfFirstPage);
    // At the very top nothing happens.
    const top = state.doc.pages[0].fields[0].id;
    expect(run(state, { type: "moveFieldBy", id: top, delta: -1 })).toBe(state);
  });

  it("removing a page keeps its questions", () => {
    const state = initialState(templateDocument("membership"));
    const total = state.doc.pages.flatMap((page) => page.fields).length;
    const next = run(state, { type: "removePage", id: state.doc.pages[1].id });
    expect(next.doc.pages).toHaveLength(1);
    expect(next.doc.pages[0].fields).toHaveLength(total);
    expect(run(next, { type: "removePage", id: next.doc.pages[0].id })).toBe(next);
  });

  it("duplicates with fresh field and option ids", () => {
    const field: FieldOf<"single_choice"> = createField("single_choice");
    const doc = blankDocument();
    doc.pages[0].fields = [field];
    const duplicate = actions.duplicateField(field);
    const next = builderReducer(initialState(doc), duplicate);
    const [original, copy] = next.doc.pages[0].fields as FieldOf<"single_choice">[];
    expect(copy.id).not.toBe(original.id);
    expect(copy.options[0].id).not.toBe(original.options[0].id);
    expect(copy.options[0].label).toBe(original.options[0].label);
  });

  it("selects a neighbour when the selected field is removed", () => {
    const doc = templateDocument("contact");
    const [first, second] = doc.pages[0].fields;
    const state = run(initialState(doc), { type: "select", id: first.id }, { type: "removeField", id: first.id });
    expect(state.selectedId).toBe(second.id);
  });

  it("changes type keeping options and clears redo history on new edits", () => {
    const doc = blankDocument();
    const radio = createField("single_choice");
    doc.pages[0].fields = [radio];
    let state = run(initialState(doc), { type: "changeType", id: radio.id, fieldType: "dropdown" });
    expect(findField(state.doc, radio.id)).toMatchObject({ type: "dropdown", options: radio.options });
    state = run(state, { type: "undo" });
    expect(state.future).toHaveLength(1);
    state = run(state, { type: "updateForm", patch: { title: "New" } });
    expect(state.future).toHaveLength(0);
  });
});
