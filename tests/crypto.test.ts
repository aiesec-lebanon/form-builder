import { describe, expect, it } from "vitest";

import { decryptJson, decryptSecret, encryptJson, encryptSecret, hashIp, hmacHex, safeEqual } from "@/lib/crypto";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips text, including unicode", () => {
    const secret = "postgres://user:pässword@db.example.com:5432/app";
    const sealed = encryptSecret(secret);
    expect(sealed.startsWith("v1:")).toBe(true);
    expect(sealed).not.toContain("pässword");
    expect(decryptSecret(sealed)).toBe(secret);
  });

  it("uses a fresh IV every time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", () => {
    const sealed = encryptSecret("top secret");
    const raw = Buffer.from(sealed.slice(3), "base64url");
    raw[raw.length - 20] ^= 0xff;
    expect(() => decryptSecret(`v1:${raw.toString("base64url")}`)).toThrow();
  });

  it("rejects unknown versions and truncated payloads", () => {
    expect(() => decryptSecret("v0:abc")).toThrow();
    expect(() => decryptSecret("v1:abc")).toThrow();
  });

  it("round-trips JSON", () => {
    const value = { key: "sb_secret_x", nested: { list: [1, 2] } };
    expect(decryptJson(encryptJson(value))).toEqual(value);
  });
});

describe("keyed hashes", () => {
  it("separates purposes", () => {
    expect(hmacHex("a", "data")).not.toBe(hmacHex("b", "data"));
  });

  it("hashes IPs deterministically without exposing them", () => {
    const hashed = hashIp("203.0.113.9");
    expect(hashed).toHaveLength(32);
    expect(hashed).toBe(hashIp("203.0.113.9"));
    expect(hashed).not.toContain("203");
    expect(hashIp(null)).toBeNull();
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
