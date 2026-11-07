import { afterEach, describe, expect, it, vi } from "vitest";

import { __test, isSensitiveKey, logger, scrub } from "@/lib/logger";

afterEach(() => vi.restoreAllMocks());

describe("isSensitiveKey", () => {
  it("flags credential-looking keys", () => {
    for (const key of ["accessToken", "refresh_token", "clientSecret", "password", "Authorization", "cookie", "apiKey", "connectionString"]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
  });

  it("keeps identifiers and ordinary keys", () => {
    for (const key of ["googleConnectionId", "formId", "tokenId", "msg", "status", "key"]) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe("scrub", () => {
  it("masks known secret env values", () => {
    const secret = process.env.SESSION_SECRET as string;
    expect(scrub(`failed with ${secret}`)).toBe("failed with [redacted]");
  });

  it("masks bearer tokens and URL passwords", () => {
    expect(scrub("Authorization: Bearer abc.def.ghi")).toBe("Authorization: Bearer [redacted]");
    expect(scrub("connect postgres://app:hunter22@db.example.com/x")).toBe("connect postgres://app:[redacted]@db.example.com/x");
  });
});

describe("serialize", () => {
  it("redacts nested sensitive keys, handles errors, bigint and cycles", () => {
    const cyclic: Record<string, unknown> = { name: "loop" };
    cyclic.self = cyclic;
    const out = __test.serialize({
      formId: "f1",
      nested: { refreshToken: "rt", ok: true },
      error: new Error("boom"),
      count: BigInt(5),
      cyclic,
    }) as Record<string, unknown>;
    expect(out.formId).toBe("f1");
    expect((out.nested as Record<string, unknown>).refreshToken).toBe("[redacted]");
    expect((out.error as Record<string, unknown>).message).toBe("boom");
    expect(out.count).toBe("5");
    expect((out.cyclic as Record<string, unknown>).self).toBe("[circular]");
  });
});

describe("logger", () => {
  it("writes one JSON line with level, msg and time", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("form.published", { formId: "f1", accessToken: "secret-value" });
    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ level: "info", msg: "form.published", formId: "f1", accessToken: "[redacted]" });
    expect(typeof entry.time).toBe("string");
  });

  it("routes errors to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("delivery.failed", { error: new Error("x") });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
