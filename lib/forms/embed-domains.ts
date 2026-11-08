// Sites allowed to embed a form (ADR-011). Isomorphic: the Share dialog
// validates as people type and the server action re-validates. The browser
// enforces the list through CSP frame-ancestors, sent by the proxy.

export const MAX_EMBED_DOMAINS = 20;

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TOP_LEVEL = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * "https://www.aiesec.org/apply" → "www.aiesec.org", "*.AIESEC.org" → "*.aiesec.org",
 * "localhost:3000" → "localhost". Null when the input isn't a website name
 * (IP addresses included: list the site's domain instead).
 */
export function normalizeEmbedDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;
  const wildcard = value.startsWith("*.");
  if (wildcard) value = value.slice(2);
  // A pasted link: keep its host. A bare name: parse it as one, which also
  // drops a port or path and turns unicode names into punycode.
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "");
  if (host === "localhost") return wildcard ? null : host;
  if (host.length > 253) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label)) || !TOP_LEVEL.test(labels[labels.length - 1])) return null;
  return wildcard ? `*.${host}` : host;
}

export type EmbedDomainsResult = { ok: true; domains: string[] } | { ok: false; error: string };

/** Normalizes, de-duplicates and caps a list; the first invalid entry is reported. */
export function parseEmbedDomains(inputs: readonly string[]): EmbedDomainsResult {
  const domains: string[] = [];
  for (const input of inputs) {
    const domain = normalizeEmbedDomain(input);
    if (!domain) return { ok: false, error: `“${input.trim().slice(0, 80)}” isn't a website name. Use a name like aiesec.org.` };
    if (!domains.includes(domain)) domains.push(domain);
  }
  if (domains.length > MAX_EMBED_DOMAINS) return { ok: false, error: `List up to ${MAX_EMBED_DOMAINS} websites.` };
  return { ok: true, domains };
}

/** The CSP frame-ancestors directive for an allowlist; an empty list allows any site. */
export function frameAncestorsDirective(domains: readonly string[]): string {
  if (domains.length === 0) return "frame-ancestors *";
  const sources = domains.map((domain) => (domain === "localhost" ? "http://localhost:*" : `https://${domain}`));
  return `frame-ancestors 'self' ${sources.join(" ")}`;
}
