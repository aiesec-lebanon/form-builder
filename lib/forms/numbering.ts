import { collectsAnswer } from "@/lib/forms/fields";
import type { Field } from "@/lib/forms/schema";

// Question numbers and short question names, shared by the builder and the
// public form so "question 3" means the same thing everywhere it's shown.

/** 1, 2, 3… in reading order. Only questions that take an answer count; text blocks don't. */
export function questionNumbers(fields: Field[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let count = 0;
  for (const field of fields) {
    if (collectsAnswer(field)) numbers.set(field.id, ++count);
  }
  return numbers;
}

/** Collapses whitespace and cuts long text at a word boundary with an ellipsis. */
export function shorten(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace >= max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** A question's name for menus and pickers: "3. What's your full name?", shortened when long. */
export function questionName(field: Field, number?: number | null, max = 48): string {
  const label = shorten(field.label, max) || (field.type === "statement" ? "Text block" : "Untitled question");
  return number ? `${number}. ${label}` : label;
}
