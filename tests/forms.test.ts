import { describe, expect, it } from "vitest";

import { compatibleTypes, convertField, createField, FIELD_DEFINITIONS, validateAnswers, validateField } from "@/lib/forms/fields";
import { formatIsoDate } from "@/lib/forms/fields/other";
import { normalizeUrl } from "@/lib/forms/fields/text";
import { buildAnswers, buildCells, buildRowData, fieldHeaders } from "@/lib/forms/payload";
import { publishProblems } from "@/lib/forms/publish-checks";
import { allFields, FIELD_TYPES, formDocumentSchema, parseDocument, type Field, type FieldOf } from "@/lib/forms/schema";
import { normalizeSlug, slugProblem } from "@/lib/forms/slug";
import { blankDocument, TEMPLATES, templateDocument } from "@/lib/forms/templates";

const expectOk = (field: Field, raw: unknown, value: unknown) => expect(validateField(field, raw)).toEqual({ ok: true, value });
const expectError = (field: Field, raw: unknown, message?: string) => {
  const result = validateField(field, raw);
  expect(result.ok).toBe(false);
  if (message && !result.ok) expect(result.error).toBe(message);
};

describe("registry", () => {
  it("defines every field type and every default passes the schema", () => {
    for (const type of FIELD_TYPES) {
      expect(FIELD_DEFINITIONS[type].type).toBe(type);
      const doc = { ...blankDocument(), pages: [{ ...blankDocument().pages[0], fields: [createField(type)] }] };
      expect(formDocumentSchema.safeParse(doc).success, type).toBe(true);
    }
  });

  it("builds valid templates with unique ids", () => {
    for (const template of TEMPLATES) {
      const doc = templateDocument(template.id);
      expect(parseDocument(doc), template.id).not.toBeNull();
    }
    expect(templateDocument("event").pages[0].fields[0].id).not.toBe(templateDocument("event").pages[0].fields[0].id);
  });

  it("rejects duplicate ids", () => {
    const doc = blankDocument();
    const duplicate = { ...doc, pages: [{ ...doc.pages[0], fields: [doc.pages[0].fields[0], doc.pages[0].fields[0]] }] };
    expect(parseDocument(duplicate)).toBeNull();
  });
});

describe("text questions", () => {
  it("short answer: trims, enforces length and required", () => {
    const field = { ...createField("short_text"), required: true, minLength: 3, maxLength: 5 };
    expectOk(field, "  abcd ", "abcd");
    expectError(field, "ab", "Use at least 3 characters.");
    expectError(field, "abcdef", "Use 5 characters or fewer.");
    expectError(field, "   ", "Enter your answer.");
    expectError(field, 42, "Enter your answer as text.");
  });

  it("optional questions accept no answer", () => {
    expectOk(createField("long_text"), undefined, null);
    expectOk(createField("long_text"), "", null);
  });

  it("email", () => {
    const field = createField("email");
    expectOk(field, "lina@aiesec.net", "lina@aiesec.net");
    expectError(field, "lina@aiesec", "Enter an email address, like name@example.com.");
  });

  it("phone", () => {
    const field = createField("phone");
    expectOk(field, "+961  3 123 456", "+961 3 123 456");
    expectError(field, "call me", "Enter a phone number, like +961 3 123 456.");
    expectError(field, "123", "Enter a phone number, like +961 3 123 456.");
  });

  it("number: coercion, integer and range", () => {
    const field: FieldOf<"number"> = { ...createField("number"), min: 18, max: 30, integer: true };
    expectOk(field, "21", 21);
    expectOk(field, 30, 30);
    expectError(field, "17", "Enter a number from 18 to 30.");
    expectError(field, "20.5", "Enter a whole number.");
    expectError(field, "abc", "Enter a number, like 12.");
    expectOk({ ...field, min: null, max: null, integer: false }, "1,250.5", 1250.5);
  });

  it("link: adds https:// to bare domains, rejects other schemes", () => {
    expect(normalizeUrl("aiesec.org")).toBe("https://aiesec.org/");
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("localhost")).toBeNull();
    expectError(createField("url"), "not a link", "Enter a link, like https://aiesec.org.");
  });
});

describe("choice questions", () => {
  const radio: FieldOf<"single_choice"> = {
    ...createField("single_choice"),
    options: [
      { id: "o_aaaaaaaa", label: "Global Volunteer" },
      { id: "o_bbbbbbbb", label: "Global Talent" },
    ],
    allowOther: true,
    required: true,
  };

  it("single choice: one option or other", () => {
    expectOk(radio, { optionIds: ["o_aaaaaaaa"], other: null }, { optionIds: ["o_aaaaaaaa"], other: null });
    expectOk(radio, { optionIds: [], other: " Teacher " }, { optionIds: [], other: "Teacher" });
    expectError(radio, { optionIds: ["o_aaaaaaaa", "o_bbbbbbbb"] }, "Choose one option.");
    expectError(radio, { optionIds: ["o_zzzzzzzz"] }, "Choose from the options listed.");
    expectError(radio, { optionIds: [], other: "  " }, "Describe your other answer.");
    expectError(radio, { optionIds: [] }, "Choose an option.");
  });

  it("rejects 'Other' when the owner did not allow it", () => {
    expectError({ ...radio, allowOther: false }, { optionIds: [], other: "x" }, "Choose from the options listed.");
  });

  it("checkboxes: min and max selections", () => {
    const checks: FieldOf<"multi_choice"> = { ...createField("multi_choice"), options: radio.options, minSelected: 2, maxSelected: 2 };
    expectOk(checks, { optionIds: ["o_aaaaaaaa", "o_bbbbbbbb"], other: null }, { optionIds: ["o_aaaaaaaa", "o_bbbbbbbb"], other: null });
    expectError(checks, { optionIds: ["o_aaaaaaaa"] }, "Choose at least 2 options.");
  });

  it("dropdown accepts a bare option id", () => {
    const select: FieldOf<"dropdown"> = { ...createField("dropdown"), options: radio.options };
    expectOk(select, "o_bbbbbbbb", { optionIds: ["o_bbbbbbbb"], other: null });
    expectOk(select, "", null);
  });
});

describe("other questions", () => {
  it("date: calendar validity and bounds", () => {
    const field: FieldOf<"date"> = { ...createField("date"), min: "2027-01-11", max: null };
    expectOk(field, "2027-02-28", "2027-02-28");
    expectError(field, "2027-02-30", "Enter a date, like 11 January 2027.");
    expectError(field, "2026-12-31", "Enter a date on or after 11 January 2027.");
    expect(formatIsoDate("2027-01-11")).toBe("11 January 2027");
  });

  it("time accepts HH:MM and HH:MM:SS", () => {
    expectOk(createField("time"), "09:05:00", "09:05");
    expectError(createField("time"), "25:00", "Enter a time, like 14:30.");
  });

  it("scale and rating bounds", () => {
    const scale: FieldOf<"linear_scale"> = { ...createField("linear_scale"), min: 0, max: 10 };
    expectOk(scale, 0, 0);
    expectError(scale, 11, "Choose a number from 0 to 10.");
    expectOk(createField("rating"), 5, 5);
    expectError(createField("rating"), 6, "Choose a rating from 1 to 5.");
  });

  it("file upload: count, size and type", () => {
    const field: FieldOf<"file_upload"> = { ...createField("file_upload"), maxFiles: 1, maxSizeMb: 1, accept: ["pdf"] };
    const pdf = { fileId: "1AbCdEfGhIjK", name: "cv.pdf", size: 1000, mimeType: "application/pdf" };
    expectOk(field, [pdf], [pdf]);
    expectError(field, [pdf, { ...pdf, fileId: "2AbCdEfGhIjK" }], "Upload up to 1 file.");
    expectError(field, [{ ...pdf, size: 2 * 1024 * 1024 }], "Each file can be up to 1 MB.");
    expectError(field, [{ ...pdf, mimeType: "image/png" }], "That file type isn't accepted here.");
    expectError(field, [{ ...pdf, fileId: "../../etc" }], "Upload the file again.");
  });

  it("consent must be ticked when required", () => {
    expectOk(createField("consent"), true, true);
    expectError(createField("consent"), false, "Tick the box to continue.");
  });

  it("statements never collect answers", () => {
    expectOk({ ...createField("statement"), required: true }, "anything", null);
  });
});

describe("grid questions", () => {
  const grid: FieldOf<"choice_grid"> = { ...createField("choice_grid"), label: "Rate each session" };
  const [first, second] = grid.rows;
  const [poor, okay, good] = grid.columns;

  it("multiple-choice grid: one known column per known row", () => {
    expectOk(grid, { [first.id]: [good.id] }, { [first.id]: [good.id] });
    expectOk(grid, { [first.id]: good.id }, { [first.id]: [good.id] });
    expectOk(grid, {}, null);
    expectOk(grid, { [first.id]: [] }, null);
    expectError(grid, { [first.id]: [good.id, poor.id] }, "Choose one answer in each row.");
    expectError(grid, { o_unknown1: [good.id] }, "Choose from the options listed.");
    expectError(grid, { [first.id]: ["o_unknown1"] }, "Choose from the options listed.");
    expectError(grid, "Good", "Choose from the options listed.");
  });

  it("a required grid needs every row answered", () => {
    const required = { ...grid, required: true };
    expectError(required, undefined, "Answer every row.");
    expectError(required, { [first.id]: [good.id] }, "Answer every row.");
    expectOk(required, { [first.id]: [good.id], [second.id]: [okay.id] }, { [first.id]: [good.id], [second.id]: [okay.id] });
  });

  it("checkbox grid allows several answers per row, without duplicates", () => {
    const boxes = createField("checkbox_grid");
    const [row] = boxes.rows;
    const [a, b] = boxes.columns;
    expectOk(boxes, { [row.id]: [a.id, b.id, a.id] }, { [row.id]: [a.id, b.id] });
    expectError({ ...boxes, required: true }, null, "Choose at least one answer in every row.");
  });

  it("sends row → column labels and gives each row its own Sheet column", () => {
    const boxes: FieldOf<"checkbox_grid"> = { ...createField("checkbox_grid"), label: "Available days" };
    const doc = { ...blankDocument(), pages: [{ ...blankDocument().pages[0], fields: [grid, boxes] }] };
    const values = { [grid.id]: { [second.id]: [okay.id] }, [boxes.id]: { [boxes.rows[0].id]: [boxes.columns[0].id, boxes.columns[2].id] } };
    const answers = buildAnswers(doc, values);
    expect(answers[0].value).toEqual({ "Row 2": "Okay" });
    expect(answers[1].value).toEqual({ "Row 1": ["Column 1", "Column 3"] });
    const headers = fieldHeaders(doc);
    expect(headers.map((header) => header.header)).toEqual(["Rate each session [Row 1]", "Rate each session [Row 2]", "Available days [Row 1]", "Available days [Row 2]"]);
    const cells = buildCells(doc, values);
    expect(headers.map((header) => cells[header.fieldId])).toEqual(["", "Okay", "Column 1, Column 3", ""]);
  });

  it("converts between grid kinds keeping rows and columns", () => {
    const converted = convertField({ ...grid, required: true }, "checkbox_grid") as FieldOf<"checkbox_grid">;
    expect(converted).toMatchObject({ id: grid.id, type: "checkbox_grid", required: true, rows: grid.rows, columns: grid.columns });
    expect(compatibleTypes("choice_grid")).toEqual(["choice_grid", "checkbox_grid"]);
  });

  it("publish checks catch blank and repeated rows", () => {
    const context = { hasPrimaryDestination: true, hasFileStorage: true };
    const withGrid = (field: Field) => ({ ...blankDocument(), pages: [{ ...blankDocument().pages[0], fields: [field] }] });
    expect(publishProblems(withGrid(grid), context)).toEqual([]);
    const blank = { ...grid, columns: [...grid.columns, { id: "o_blankcol1", label: " " }] };
    expect(publishProblems(withGrid(blank), context).map((problem) => problem.id)).toEqual([`grid-${grid.id}`]);
    const repeated = { ...grid, rows: [first, { ...second, label: "row 1 " }] };
    expect(publishProblems(withGrid(repeated), context).map((problem) => problem.id)).toEqual([`grid-rows-${grid.id}`]);
  });
});

describe("type conversion", () => {
  it("keeps label, required and options across compatible types", () => {
    const radio = { ...createField("single_choice"), label: "Programme", required: true };
    const converted = convertField(radio, "multi_choice") as FieldOf<"multi_choice">;
    expect(converted).toMatchObject({ id: radio.id, type: "multi_choice", label: "Programme", required: true, options: radio.options });
    expect(compatibleTypes("dropdown")).toContain("single_choice");
  });

  it("drops another type's default placeholder", () => {
    const converted = convertField(createField("email"), "short_text") as FieldOf<"short_text">;
    expect(converted.placeholder).toBe("");
  });
});

describe("payload", () => {
  const doc = templateDocument("event");
  const fields = allFields(doc);
  const name = fields[0];
  const sessions = fields.find((field) => field.type === "multi_choice") as FieldOf<"multi_choice">;
  const consent = fields.find((field) => field.type === "consent") as Field;

  it("validates a whole submission and reports per-field errors", () => {
    const result = validateAnswers(fields, { [name.id]: "", unknown: "ignored" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors)).toEqual(expect.arrayContaining([name.id, consent.id]));
      expect(result.errors).not.toHaveProperty("unknown");
    }
  });

  it("outputs labels, arrays and spreadsheet cells", () => {
    const values = {
      [name.id]: "Lina Haddad",
      [sessions.id]: { optionIds: [sessions.options[0].id, sessions.options[2].id], other: null },
      [consent.id]: true,
    };
    const answers = buildAnswers(doc, values);
    expect(answers.find((answer) => answer.fieldId === sessions.id)?.value).toEqual(["Opening ceremony", "Networking evening"]);
    expect(answers.find((answer) => answer.fieldId === fields[1].id)?.value).toBeNull();
    const cells = buildCells(doc, values);
    expect(cells[sessions.id]).toBe("Opening ceremony, Networking evening");
    expect(cells[consent.id]).toBe("Yes");
    expect(buildRowData(answers)[name.id]).toEqual({ label: "Full name", value: "Lina Haddad" });
    expect(fieldHeaders(doc).map((header) => header.header)).toContain("Full name");
  });
});

describe("publish checks", () => {
  it("lists what to fix", () => {
    const doc = blankDocument("");
    const problems = publishProblems(doc, { hasPrimaryDestination: false, hasFileStorage: false });
    expect(problems.map((problem) => problem.id)).toEqual(expect.arrayContaining(["title", "destination"]));
    expect(problems.some((problem) => problem.message.includes("add a question title"))).toBe(true);
  });

  it("requires Drive for file questions", () => {
    const doc = templateDocument("membership");
    const problems = publishProblems(doc, { hasPrimaryDestination: true, hasFileStorage: false });
    expect(problems.map((problem) => problem.id)).toEqual(["file-storage"]);
    expect(publishProblems(doc, { hasPrimaryDestination: true, hasFileStorage: true })).toEqual([]);
  });
});

describe("slugs", () => {
  it("normalizes and validates", () => {
    expect(normalizeSlug("Recruitment Fall '27!")).toBe("recruitment-fall-27");
    expect(normalizeSlug("Événement Été")).toBe("evenement-ete");
    expect(slugProblem("recruitment-fall-27")).toBeNull();
    expect(slugProblem("ab")).not.toBeNull();
    expect(slugProblem("-bad")).not.toBeNull();
    expect(slugProblem("admin")).toBe("That link is reserved. Try another.");
  });
});
