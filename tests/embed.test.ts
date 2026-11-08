import { afterEach, describe, expect, it, vi } from "vitest";

import { frameAncestorsDirective, MAX_EMBED_DOMAINS, normalizeEmbedDomain, parseEmbedDomains } from "@/lib/forms/embed-domains";

const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({ db: { form: { findUnique: (...args: unknown[]) => findUnique(...args) } } }));

const { clearEmbedPolicyCache, embedFrameAncestors, FAIL_CLOSED } = await import("@/lib/forms/embed-policy");

describe("embed site names", () => {
  it("normalizes names, pasted links and wildcards", () => {
    expect(normalizeEmbedDomain("aiesec.org")).toBe("aiesec.org");
    expect(normalizeEmbedDomain("  AIESEC.org ")).toBe("aiesec.org");
    expect(normalizeEmbedDomain("https://www.aiesec.org/apply?ref=1")).toBe("www.aiesec.org");
    expect(normalizeEmbedDomain("aiesec.org:8443/path")).toBe("aiesec.org");
    expect(normalizeEmbedDomain("aiesec.org.")).toBe("aiesec.org");
    expect(normalizeEmbedDomain("*.AIESEC.org")).toBe("*.aiesec.org");
    expect(normalizeEmbedDomain("localhost:3000")).toBe("localhost");
    expect(normalizeEmbedDomain("münchen.de")).toBe("xn--mnchen-3ya.de");
  });

  it("rejects things that aren't website names", () => {
    for (const input of ["", "aiesec", "192.168.1.10", "-bad.org", "bad-.org", "exa mple.org", "*.localhost", "*.*.aiesec.org", "javascript:alert(1)", "aiesec.123"]) {
      expect(normalizeEmbedDomain(input), input).toBeNull();
    }
  });

  it("de-duplicates, reports the first bad entry and caps the list", () => {
    expect(parseEmbedDomains(["aiesec.org", "https://aiesec.org/", "*.aiesec.org"])).toEqual({ ok: true, domains: ["aiesec.org", "*.aiesec.org"] });
    const bad = parseEmbedDomains(["aiesec.org", "not a site"]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain("not a site");
    const many = Array.from({ length: MAX_EMBED_DOMAINS + 1 }, (_, index) => `site${index}.org`);
    expect(parseEmbedDomains(many)).toEqual({ ok: false, error: `List up to ${MAX_EMBED_DOMAINS} websites.` });
  });

  it("builds the frame-ancestors directive", () => {
    expect(frameAncestorsDirective([])).toBe("frame-ancestors *");
    expect(frameAncestorsDirective(["aiesec.org", "*.aiesec.org", "localhost"])).toBe("frame-ancestors 'self' https://aiesec.org https://*.aiesec.org http://localhost:*");
  });
});

describe("embed policy lookup", () => {
  afterEach(() => {
    findUnique.mockReset();
    clearEmbedPolicyCache();
  });

  it("reads the form's list once per minute", async () => {
    findUnique.mockResolvedValue({ embedDomains: ["aiesec.org"], deletedAt: null });
    expect(await embedFrameAncestors("recruitment", 1_000)).toBe("frame-ancestors 'self' https://aiesec.org");
    expect(await embedFrameAncestors("recruitment", 30_000)).toBe("frame-ancestors 'self' https://aiesec.org");
    expect(findUnique).toHaveBeenCalledTimes(1);
    findUnique.mockResolvedValue({ embedDomains: [], deletedAt: null });
    expect(await embedFrameAncestors("recruitment", 62_000)).toBe("frame-ancestors *");
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("allows framing of unknown and trashed forms (they show not found)", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await embedFrameAncestors("missing")).toBe("frame-ancestors *");
    findUnique.mockResolvedValueOnce({ embedDomains: ["aiesec.org"], deletedAt: new Date() });
    expect(await embedFrameAncestors("trashed")).toBe("frame-ancestors *");
  });

  it("keeps the last known list when the database fails, and fails closed without one", async () => {
    findUnique.mockResolvedValueOnce({ embedDomains: ["aiesec.org"], deletedAt: null });
    await embedFrameAncestors("recruitment", 0);
    findUnique.mockRejectedValueOnce(new Error("connection timeout"));
    expect(await embedFrameAncestors("recruitment", 120_000)).toBe("frame-ancestors 'self' https://aiesec.org");
    findUnique.mockRejectedValueOnce(new Error("connection timeout"));
    expect(await embedFrameAncestors("never-seen", 120_000)).toBe(FAIL_CLOSED);
  });
});
