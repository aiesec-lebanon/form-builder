// Short random ids for pages (p_), fields (f_) and options (o_). Isomorphic:
// Web Crypto exists in browsers and in Node 20+.

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export type IdPrefix = "p" | "f" | "o";

export function newId(prefix: IdPrefix, length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = `${prefix}_`;
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

export const ID_PATTERN = {
  p: /^p_[a-z0-9]{6,16}$/,
  f: /^f_[a-z0-9]{6,16}$/,
  o: /^o_[a-z0-9]{6,16}$/,
} as const;
