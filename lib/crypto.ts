import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

// Cryptographic helpers. No "server-only" import because proxy.ts (Node
// runtime) uses the key derivation; nothing here is reachable from client code.

const SECRET_VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function encryptionKey(): Buffer {
  return Buffer.from(env().ENCRYPTION_KEY, "base64");
}

/** AES-256-GCM. Output: "v1:" + base64url(iv | ciphertext | tag). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${SECRET_VERSION}:${Buffer.concat([iv, ciphertext, tag]).toString("base64url")}`;
}

/** Throws if the value was tampered with or encrypted under another key. */
export function decryptSecret(value: string): string {
  const [version, payload] = value.split(":", 2);
  if (version !== SECRET_VERSION || !payload) throw new Error("Unsupported secret format");
  const raw = Buffer.from(payload, "base64url");
  if (raw.length < IV_BYTES + TAG_BYTES) throw new Error("Secret is truncated");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(raw.length - TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES, raw.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson(value: string): unknown {
  return JSON.parse(decryptSecret(value));
}

/**
 * A 32-byte key derived from SESSION_SECRET for one purpose, so one secret can
 * safely serve several uses (session sealing, render tokens, IP hashing).
 */
export function derivedKey(purpose: string): Buffer {
  return Buffer.from(hkdfSync("sha256", env().SESSION_SECRET, "aiesec-forms", purpose, 32));
}

export function hmacHex(purpose: string, data: string): string {
  return createHmac("sha256", derivedKey(purpose)).update(data).digest("hex");
}

export function hmacBase64Url(purpose: string, data: string): string {
  return createHmac("sha256", derivedKey(purpose)).update(data).digest("base64url");
}

/** Constant-time string comparison that does not leak length. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right) && a.length === b.length;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Raw IPs are never stored; this keyed hash still lets us correlate events. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmacHex("ip-hash-v1", ip).slice(0, 32);
}

/** HMAC-SHA256 with a caller-supplied key (webhook signatures). */
export function hmacSha256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data).digest("hex");
}
