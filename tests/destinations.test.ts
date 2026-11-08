import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { syncColumns, sheetTimestamp } from "@/lib/destinations/google-sheets";
import { describePgError, parseConnectionString, quoteIdent } from "@/lib/destinations/postgres";
import { supabaseHeaders } from "@/lib/destinations/supabase";
import { interpretStatus, newSigningSecret, signatureHeaders } from "@/lib/destinations/webhook";
import { createField } from "@/lib/forms/fields";
import { issueRenderToken, MIN_AGE_MS, verifyRenderToken } from "@/lib/forms/render-token";
import { blankDocument } from "@/lib/forms/templates";
import { isPublicAddress } from "@/lib/net/ip";
import { driveFileName } from "@/lib/uploads";

describe("SSRF address guard", () => {
  it.each(["8.8.8.8", "1.1.1.1", "13.230.1.5", "2606:4700:4700::1111", "2a00:1450:4001:82a::200e"])("allows public %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.51.100.7",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:7f00:0001::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe("webhook", () => {
  it("signs timestamp + body with HMAC-SHA256 so receivers can verify", () => {
    const secret = newSigningSecret();
    expect(secret.startsWith("whsec_")).toBe(true);
    const body = JSON.stringify({ event: "response.created", responseId: "r1" });
    const headers = signatureHeaders(secret, body, 1_800_000_000);
    const expected = createHmac("sha256", secret).update(`1800000000.${body}`).digest("hex");
    expect(headers["X-AIESEC-Forms-Timestamp"]).toBe("1800000000");
    expect(headers["X-AIESEC-Forms-Signature"]).toBe(`v1=${expected}`);
  });

  it("treats only 2xx as delivered and classifies the rest", () => {
    expect(interpretStatus(204)).toEqual({ ok: true });
    expect(interpretStatus(302)).toMatchObject({ ok: false, retryable: false });
    expect(interpretStatus(404)).toMatchObject({ ok: false, retryable: false });
    expect(interpretStatus(429)).toMatchObject({ ok: false, retryable: true });
    expect(interpretStatus(503)).toMatchObject({ ok: false, retryable: true });
  });
});

describe("supabase", () => {
  it("sends new-style keys only as apikey", () => {
    const headers = supabaseHeaders("sb_secret_abcdefghijklmnopqrstuvwxyz", "public");
    expect(headers.apikey).toBe("sb_secret_abcdefghijklmnopqrstuvwxyz");
    expect(headers.Authorization).toBeUndefined();
    expect(headers["Content-Profile"]).toBeUndefined();
  });

  it("sends legacy JWT keys as bearer too, and sets the schema profile", () => {
    const headers = supabaseHeaders("eyJhbGciOiJIUzI1NiJ9.payload.signature", "forms");
    expect(headers.Authorization).toBe("Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature");
    expect(headers["Content-Profile"]).toBe("forms");
  });
});

describe("postgres", () => {
  it("parses connection strings and decodes credentials", () => {
    expect(parseConnectionString("postgresql://app%40x:p%23ss@db.example.com:6543/forms")).toEqual({
      host: "db.example.com",
      port: 6543,
      user: "app@x",
      password: "p#ss",
      database: "forms",
    });
  });

  it("refuses non-Postgres URLs, missing hosts and disabled TLS", () => {
    expect(parseConnectionString("mysql://u:p@h/db")).toHaveProperty("error");
    expect(parseConnectionString("not a url")).toHaveProperty("error");
    expect(parseConnectionString("postgresql://u:p@h:5432/db?sslmode=disable")).toHaveProperty("error");
  });

  it("only quotes safe identifiers", () => {
    expect(quoteIdent("form_responses")).toBe('"form_responses"');
    expect(() => quoteIdent('x"; drop table users; --')).toThrow();
  });

  it("explains errors without leaking credentials", () => {
    expect(describePgError({ code: "28P01" })).toMatchObject({ ok: false, retryable: false });
    expect(describePgError({ code: "ECONNREFUSED" })).toMatchObject({ ok: false, retryable: true });
    const result = describePgError({ code: "XX000", message: "password=hunter2" });
    expect(JSON.stringify(result)).not.toContain("hunter2");
  });
});

describe("google sheets columns", () => {
  it("keeps existing columns in place, refreshes labels and appends new questions", () => {
    const doc = blankDocument();
    const first = { ...createField("short_text"), label: "Full name (renamed)" };
    const second = { ...createField("email"), label: "Email" };
    doc.pages[0].fields = [second, first];
    const { columns, headerRow } = syncColumns([{ fieldId: first.id, header: "Full name" }], doc);
    expect(columns.map((column) => column.fieldId)).toEqual([first.id, second.id]);
    expect(headerRow).toEqual(["Submitted at", "Response ID", "Full name (renamed)", "Email"]);
  });

  it("is idempotent and skips display-only blocks", () => {
    const doc = blankDocument();
    doc.pages[0].fields = [{ ...createField("statement"), label: "Welcome" }, { ...createField("number"), label: "Age" }];
    const once = syncColumns([], doc);
    const twice = syncColumns(once.columns, doc);
    expect(twice.columns).toEqual(once.columns);
    expect(once.headerRow).toEqual(["Submitted at", "Response ID", "Age"]);
  });

  it("formats timestamps as sortable UTC text", () => {
    expect(sheetTimestamp("2026-11-08T14:32:05.123Z")).toBe("2026-11-08 14:32:05 UTC");
  });
});

describe("render tokens", () => {
  const formId = "6f1c2b3a-4d5e-4f60-8a9b-0c1d2e3f4a5b";

  it("must be at least two seconds old and for the same form", () => {
    const issuedAt = 1_800_000_000_000;
    const token = issueRenderToken(formId, issuedAt);
    expect(verifyRenderToken(token, formId, issuedAt + 100)).toEqual({ ok: false, reason: "too_fast" });
    expect(verifyRenderToken(token, formId, issuedAt + MIN_AGE_MS + 1)).toEqual({ ok: true });
    expect(verifyRenderToken(token, "00000000-0000-4000-8000-000000000000", issuedAt + 5000)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects forged and expired tokens", () => {
    const token = issueRenderToken(formId, 1_800_000_000_000);
    const [body] = token.split(".");
    expect(verifyRenderToken(`${body}.forged`, formId, 1_800_000_010_000)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyRenderToken(token, formId, 1_800_000_000_000 + 31 * 24 * 60 * 60 * 1000)).toEqual({ ok: false, reason: "expired" });
    expect(verifyRenderToken(42, formId)).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("drive file names", () => {
  it("keeps the person's own name and strips path tricks", () => {
    expect(driveFileName("../../etc/passwd")).toBe(".. .. etc passwd");
    expect(driveFileName("cv\u0000.pdf")).toBe("cv .pdf");
    expect(driveFileName("   ")).toBe("upload");
  });
});
