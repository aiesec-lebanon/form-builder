import { describe, expect, it } from "vitest";

import { builderReducer, initialState } from "@/components/builder/state";
import { createField, validateAnswers } from "@/lib/forms/fields";
import { computeVisibility, conditionSources, describeCondition, evaluateCondition, visibleFields } from "@/lib/forms/logic";
import { publishProblems } from "@/lib/forms/publish-checks";
import type { FieldOf, FormDocument } from "@/lib/forms/schema";
import { blankDocument } from "@/lib/forms/templates";

function scenario() {
  const programme: FieldOf<"single_choice"> = {
    ...createField("single_choice"),
    label: "Programme",
    options: [
      { id: "o_gvgvgvgv", label: "Global Volunteer" },
      { id: "o_gtgtgtgt", label: "Global Talent" },
    ],
  };
  const project = { ...createField("short_text"), label: "Which project?", required: true, visibleIf: { fieldId: programme.id, operator: "is" as const, value: "o_gvgvgvgv" } };
  const detail = { ...createField("long_text"), label: "Tell us more", visibleIf: { fieldId: project.id, operator: "answered" as const, value: "" } };
  const doc: FormDocument = blankDocument("Logic");
  doc.pages = [
    { ...doc.pages[0], fields: [programme, project, detail] },
    { id: "p_talentpg", title: "Talent", description: "", visibleIf: { fieldId: programme.id, operator: "is", value: "o_gtgtgtgt" }, fields: [{ ...createField("url"), label: "Portfolio" }] },
  ];
  return { doc, programme, project, detail };
}

describe("conditions", () => {
  it("evaluates operators against raw answers", () => {
    const { programme } = scenario();
    const choice = { optionIds: ["o_gvgvgvgv"], other: null };
    expect(evaluateCondition({ fieldId: programme.id, operator: "is", value: "o_gvgvgvgv" }, programme, choice)).toBe(true);
    expect(evaluateCondition({ fieldId: programme.id, operator: "is_not", value: "o_gvgvgvgv" }, programme, choice)).toBe(false);
    expect(evaluateCondition({ fieldId: programme.id, operator: "is_not", value: "o_gvgvgvgv" }, programme, undefined)).toBe(false);
    expect(evaluateCondition({ fieldId: programme.id, operator: "not_answered", value: "" }, programme, undefined)).toBe(true);
    const name = { ...createField("short_text") };
    expect(evaluateCondition({ fieldId: name.id, operator: "contains", value: "AIESEC" }, name, "I love aiesec")).toBe(true);
    expect(evaluateCondition({ fieldId: name.id, operator: "is", value: " beirut " }, name, "Beirut")).toBe(true);
  });

  it("shows follow-ups only when their source matches, and cascades hiding", () => {
    const { doc, programme, project, detail } = scenario();
    const none = computeVisibility(doc, {});
    expect(none.fields.has(project.id)).toBe(false);
    expect(none.fields.has(detail.id)).toBe(false);
    expect(none.pages.has("p_talentpg")).toBe(false);

    const gv = computeVisibility(doc, { [programme.id]: { optionIds: ["o_gvgvgvgv"], other: null }, [project.id]: "Teach English" });
    expect(gv.fields.has(project.id)).toBe(true);
    expect(gv.fields.has(detail.id)).toBe(true);

    // Switching programme hides the project question, so its answer no longer reveals "Tell us more".
    const gt = computeVisibility(doc, { [programme.id]: { optionIds: ["o_gtgtgtgt"], other: null }, [project.id]: "Teach English" });
    expect(gt.fields.has(project.id)).toBe(false);
    expect(gt.fields.has(detail.id)).toBe(false);
    expect(gt.pages.has("p_talentpg")).toBe(true);
  });

  it("only validates visible questions (hidden required questions don't block)", () => {
    const { doc, programme } = scenario();
    const answers = { [programme.id]: { optionIds: ["o_gtgtgtgt"], other: null } };
    expect(validateAnswers(visibleFields(doc, answers), answers).ok).toBe(true);
    const gvAnswers = { [programme.id]: { optionIds: ["o_gvgvgvgv"], other: null } };
    expect(validateAnswers(visibleFields(doc, gvAnswers), gvAnswers).ok).toBe(false);
  });

  it("offers only earlier questions as sources and describes rules plainly", () => {
    const { doc, programme, project } = scenario();
    expect(conditionSources(doc, { fieldId: project.id }).map((field) => field.id)).toEqual([programme.id]);
    expect(describeCondition(doc, project.visibleIf)).toBe("Programme is “Global Volunteer”");
  });

  it("blocks publishing when a rule points at a later or deleted question", () => {
    const { doc, programme, project } = scenario();
    doc.pages[0].fields = [project, programme];
    const problems = publishProblems(doc, { hasPrimaryDestination: true, hasFileStorage: true });
    expect(problems.some((problem) => problem.id === `logic-${project.id}`)).toBe(true);
  });

  it("clears rules when their source question is deleted", () => {
    const { doc, programme, project } = scenario();
    const next = builderReducer(initialState(doc), { type: "removeField", id: programme.id });
    const remaining = next.doc.pages[0].fields.find((field) => field.id === project.id);
    expect(remaining?.visibleIf).toBeNull();
    expect(next.doc.pages[1].visibleIf).toBeNull();
  });
});
