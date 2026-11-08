import { describe, expect, it } from "vitest";

import { createField } from "@/lib/forms/fields";
import { questionName, questionNumbers, shorten } from "@/lib/forms/numbering";
import { settingsSchema } from "@/lib/forms/schema";

const field = (type: Parameters<typeof createField>[0], label: string, id: string) => ({ ...createField(type), id, label });

describe("question numbers", () => {
  it("counts questions in order and skips text blocks", () => {
    const fields = [field("short_text", "Name", "f_a"), field("statement", "About you", "f_b"), field("email", "Email", "f_c"), field("dropdown", "LC", "f_d")];
    expect([...questionNumbers(fields)]).toEqual([
      ["f_a", 1],
      ["f_c", 2],
      ["f_d", 3],
    ]);
    expect(questionNumbers([]).size).toBe(0);
  });

  it("is on by default for new and old forms", () => {
    expect(settingsSchema.parse({}).numberQuestions).toBe(true);
  });
});

describe("short question names", () => {
  it("cuts long text at a word boundary", () => {
    expect(shorten("Lorem Ipsum is simply dummy text of the printing and typesetting industry", 30)).toBe("Lorem Ipsum is simply dummy…");
    expect(shorten("  Full \n name  ", 30)).toBe("Full name");
    expect(shorten("Supercalifragilisticexpialidocious", 10)).toBe("Supercali…");
  });

  it("names questions with their number for pickers", () => {
    expect(questionName(field("short_text", "What is your full name?", "f_a"), 3)).toBe("3. What is your full name?");
    expect(questionName(field("short_text", "   ", "f_a"), 2)).toBe("2. Untitled question");
    expect(questionName(field("statement", "", "f_b"))).toBe("Text block");
    expect(questionName(field("long_text", "x ".repeat(80), "f_c"), 1, 20).length).toBeLessThanOrEqual(23);
  });
});
