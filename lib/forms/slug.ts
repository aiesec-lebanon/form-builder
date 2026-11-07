// Public form links: /f/<slug>. Lowercase letters, numbers and hyphens, 3–60
// characters (mirrors the forms_slug_format CHECK constraint).

const SLUG = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes (l, o, 0, 1)

export const RESERVED_SLUGS = new Set([
  "admin",
  "aiesec",
  "api",
  "app",
  "embed",
  "forms",
  "help",
  "login",
  "logout",
  "new",
  "privacy",
  "settings",
  "static",
  "support",
  "terms",
  "unauthorized",
]);

export function generateSlug(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let slug = "";
  for (const byte of bytes) slug += ALPHABET[byte % ALPHABET.length];
  return slug;
}

/** Turns typed text into a slug candidate: "Recruitment Fall '27!" → "recruitment-fall-27". */
export function normalizeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** A reason the slug can't be used, or null. */
export function slugProblem(slug: string): string | null {
  if (!SLUG.test(slug)) return "Use 3 to 60 lowercase letters, numbers or hyphens, starting and ending with a letter or number.";
  if (RESERVED_SLUGS.has(slug)) return "That link is reserved. Try another.";
  return null;
}
