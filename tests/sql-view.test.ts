import { describe, expect, it } from "vitest";

import { columnName, columnsViewSql } from "@/lib/destinations/sql";
import { createField } from "@/lib/forms/fields";
import type { Field, FormDocument } from "@/lib/forms/schema";
import { blankDocument } from "@/lib/forms/templates";

const FORM_ID = "3f2b8c1e-5d4a-4b6f-9c2e-1a7d8e9f0b12";

function docWith(fields: Field[], access: Partial<FormDocument["settings"]["access"]> = {}): FormDocument {
  const doc = blankDocument("Recruitment Fall '27");
  return { ...doc, pages: [{ ...doc.pages[0], fields }], settings: { ...doc.settings, access: { ...doc.settings.access, ...access } } };
}

describe("per-question view SQL", () => {
  it("turns labels into safe column names", () => {
    expect(columnName("Which committee are you in?", "q")).toBe("which_committee_are_you_in");
    expect(columnName("Événement Été", "q")).toBe("evenement_ete");
    expect(columnName("2nd choice", "q")).toBe("q_2nd_choice");
    expect(columnName("???", "question_3")).toBe("question_3");
    expect(columnName("x".repeat(80), "q")).toHaveLength(59);
  });

  it("selects one typed column per question from the data column", () => {
    const name = { ...createField("short_text"), id: "f_name00001", label: "Full name" };
    const age = { ...createField("number"), id: "f_age000001", label: "Age" };
    const sessions = { ...createField("multi_choice"), id: "f_sess00001", label: "Sessions" };
    const consent = { ...createField("consent"), id: "f_cons00001", label: "Consent" };
    const duplicate = { ...createField("short_text"), id: "f_name00002", label: "Full name" };
    const reserved = { ...createField("short_text"), id: "f_data00001", label: "Data" };
    const heading = { ...createField("statement"), id: "f_head00001", label: "About you" };
    const sql = columnsViewSql({ doc: docWith([name, age, sessions, consent, duplicate, reserved, heading]), formId: FORM_ID, schema: "public", table: "form_responses" });
    expect(sql).toContain('drop view if exists "public"."recruitment_fall_27_responses";');
    expect(sql).toContain(`data->'f_name00001'->'value'#>>'{}' as "full_name"`);
    expect(sql).toContain(`(data->'f_age000001'->'value'#>>'{}')::numeric as "age"`);
    expect(sql).toContain(`data->'f_sess00001'->'value' as "sessions"`);
    expect(sql).toContain(`(data->'f_cons00001'->'value'#>>'{}')::boolean as "consent"`);
    expect(sql).toContain(`as "full_name_2"`);
    expect(sql).toContain(`as "data_2"`);
    expect(sql).not.toContain("about_you");
    expect(sql).toContain(`from "public"."form_responses"\nwhere form_id = '${FORM_ID}';`);
  });

  it("gives each grid row its own column and adds respondent columns when recorded", () => {
    const grid = { ...createField("choice_grid"), id: "f_grid00001", label: "Rate it" };
    const boxes = { ...createField("checkbox_grid"), id: "f_box000001", label: "Days" };
    const sql = columnsViewSql({ doc: docWith([grid, boxes], { mode: "aiesec", recordRespondent: true }), formId: FORM_ID, schema: "forms", table: "responses" });
    expect(sql).toContain(`data->'respondent.name'->'value'#>>'{}' as "name"`);
    expect(sql).toContain(`data->'respondent.aiesecId'->'value'#>>'{}' as "aiesec_id"`);
    expect(sql).toContain(`data->'f_grid00001'->'value'->'Row 1'#>>'{}' as "rate_it_row_1"`);
    expect(sql).toContain(`data->'f_box000001'->'value'->'Row 2' as "days_row_2"`);
    expect(sql).toContain('from "forms"."responses"');
  });

  it("escapes quotes in names and labels", () => {
    const question = { ...createField("short_text"), id: "f_quote0001", label: "It's \"quoted\"" };
    const doc = { ...docWith([question]), title: 'Lina\'s "form"' };
    const sql = columnsViewSql({ doc, formId: "id'x", schema: 'we"ird', table: "t" });
    expect(sql).toContain(`"we""ird"`);
    expect(sql).toContain(`where form_id = 'id''x';`);
    expect(sql).toContain(`as "it_s_quoted"`);
  });
});
