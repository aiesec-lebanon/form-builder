import { LIMITS, type FieldOf } from "../schema";
import { invalid, ok, type FieldDefinition, type ValidationResult } from "./types";

// Text-like questions: short and long answers, email, phone, number, link.

const pluralChars = (n: number) => `${n} character${n === 1 ? "" : "s"}`;

function readText(raw: unknown, hardMax: number): ValidationResult | string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") return invalid("Enter your answer as text.");
  const value = raw.trim();
  if (!value) return null;
  if (value.length > hardMax) return invalid(`Use ${pluralChars(hardMax)} or fewer.`);
  return value;
}

function lengthRules(value: string, min: number | null, max: number | null): ValidationResult {
  if (min !== null && value.length < min) return invalid(`Use at least ${pluralChars(min)}.`);
  if (max !== null && value.length > max) return invalid(`Use ${pluralChars(max)} or fewer.`);
  return ok(value);
}

const asString = (_field: unknown, value: unknown) => String(value);

export const shortText: FieldDefinition<FieldOf<"short_text">> = {
  type: "short_text",
  name: "Short answer",
  hint: "A name, a title, one line",
  group: "text",
  collectsAnswer: true,
  create: (id) => ({ id, type: "short_text", label: "", description: "", required: false, placeholder: "", minLength: null, maxLength: null }),
  validate: (field, raw) => {
    const text = readText(raw, LIMITS.shortText);
    if (text === null) return ok(null);
    if (typeof text !== "string") return text;
    return lengthRules(text, field.minLength, field.maxLength);
  },
  requiredMessage: () => "Enter your answer.",
  toOutput: asString,
  toCell: asString,
};

export const longText: FieldDefinition<FieldOf<"long_text">> = {
  type: "long_text",
  name: "Paragraph",
  hint: "Longer answers, motivation, feedback",
  group: "text",
  collectsAnswer: true,
  create: (id) => ({ id, type: "long_text", label: "", description: "", required: false, placeholder: "", minLength: null, maxLength: null }),
  validate: (field, raw) => {
    const text = readText(raw, LIMITS.longText);
    if (text === null) return ok(null);
    if (typeof text !== "string") return text;
    return lengthRules(text, field.minLength, field.maxLength);
  },
  requiredMessage: () => "Enter your answer.",
  toOutput: asString,
  toCell: asString,
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const email: FieldDefinition<FieldOf<"email">> = {
  type: "email",
  name: "Email",
  hint: "Checks the address looks right",
  group: "text",
  collectsAnswer: true,
  create: (id) => ({ id, type: "email", label: "Email address", description: "", required: false, placeholder: "name@example.com" }),
  validate: (_field, raw) => {
    const text = readText(raw, 254);
    if (text === null) return ok(null);
    if (typeof text !== "string") return text;
    return EMAIL.test(text) ? ok(text) : invalid("Enter an email address, like name@example.com.");
  },
  requiredMessage: () => "Enter an email address.",
  toOutput: asString,
  toCell: asString,
};

const PHONE_CHARS = /^\+?[\d\s().-]+$/;

export const phone: FieldDefinition<FieldOf<"phone">> = {
  type: "phone",
  name: "Phone",
  hint: "International numbers welcome",
  group: "text",
  collectsAnswer: true,
  create: (id) => ({ id, type: "phone", label: "Phone number", description: "", required: false, placeholder: "+961 3 123 456" }),
  validate: (_field, raw) => {
    const text = readText(raw, 40);
    if (text === null) return ok(null);
    if (typeof text !== "string") return text;
    const digits = text.replace(/\D/g, "").length;
    if (!PHONE_CHARS.test(text) || digits < 6 || digits > 15) return invalid("Enter a phone number, like +961 3 123 456.");
    return ok(text.replace(/\s+/g, " "));
  },
  requiredMessage: () => "Enter a phone number.",
  toOutput: asString,
  toCell: asString,
};

function rangeMessage(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `Enter a number from ${min} to ${max}.`;
  if (min !== null) return `Enter ${min} or more.`;
  return `Enter ${max} or less.`;
}

export const number: FieldDefinition<FieldOf<"number">> = {
  type: "number",
  name: "Number",
  hint: "Age, quantity, budget",
  group: "text",
  collectsAnswer: true,
  create: (id) => ({ id, type: "number", label: "", description: "", required: false, placeholder: "", min: null, max: null, integer: false }),
  validate: (field, raw) => {
    if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) return ok(null);
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(/,/g, "")) : Number.NaN;
    if (!Number.isFinite(value)) return invalid("Enter a number, like 12.");
    if (field.integer && !Number.isInteger(value)) return invalid("Enter a whole number.");
    if ((field.min !== null && value < field.min) || (field.max !== null && value > field.max)) return invalid(rangeMessage(field.min, field.max));
    return ok(value);
  },
  requiredMessage: () => "Enter a number.",
  toOutput: (_field, value) => Number(value),
  toCell: (_field, value) => Number(value),
};

/** Adds https:// to bare domains ("aiesec.org"), so people needn't type it. */
export function normalizeUrl(text: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export const url: FieldDefinition<FieldOf<"url">> = {
  type: "url",
  name: "Link",
  hint: "Portfolio, LinkedIn, website",
  group: "text",
  collectsAnswer: true,
  create: (id) => ({ id, type: "url", label: "", description: "", required: false, placeholder: "https://" }),
  validate: (_field, raw) => {
    const text = readText(raw, 2000);
    if (text === null) return ok(null);
    if (typeof text !== "string") return text;
    const normalized = normalizeUrl(text);
    return normalized ? ok(normalized) : invalid("Enter a link, like https://aiesec.org.");
  },
  requiredMessage: () => "Enter a link.",
  toOutput: asString,
  toCell: asString,
};
