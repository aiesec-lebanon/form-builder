import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP } from "node:net";

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";

import { isPublicAddress } from "./ip";

// Network access to owner-supplied hosts (webhooks, Supabase, Postgres).
// Hostnames are resolved and every address must be public; the same check
// runs again at connect time, so DNS rebinding can't slip a private IP in.

export class BlockedHostError extends Error {
  constructor(message = "That address points to a private or reserved network.") {
    super(message);
    this.name = "BlockedHostError";
  }
}

const BLOCKED_NAMES = /^(localhost|localhost\.localdomain|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

function lookupAll(hostname: string): Promise<LookupAddress[]> {
  return new Promise((resolve, reject) => {
    dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => (error ? reject(error) : resolve(addresses)));
  });
}

/** Resolves a hostname and returns its addresses if (and only if) all are public. */
export async function resolvePublicHost(hostname: string): Promise<LookupAddress[]> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_NAMES.test(host)) throw new BlockedHostError();
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new BlockedHostError();
    return [{ address: host, family: isIP(host) }];
  }
  const addresses = await lookupAll(host);
  if (addresses.length === 0) throw new Error(`No addresses for ${host}`);
  if (addresses.some((entry) => !isPublicAddress(entry.address))) throw new BlockedHostError();
  return addresses;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** A `lookup` for sockets that refuses non-public answers at connect time. */
function guardedLookup(hostname: string, options: { all?: boolean } | number | undefined, callback: LookupCallback): void {
  resolvePublicHost(hostname).then(
    (addresses) => {
      if (typeof options === "object" && options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    },
    (error: NodeJS.ErrnoException) => callback(error, ""),
  );
}

let agent: Agent | undefined;
function guardedAgent(): Agent {
  agent ??= new Agent({
    connect: { lookup: guardedLookup as never, timeout: 10_000 },
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
  });
  return agent;
}

/** Throws unless the URL is https on a public host (literal IPs included). */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedHostError("That isn't a valid link.");
  }
  if (url.protocol !== "https:") throw new BlockedHostError("Use a link that starts with https://");
  if (url.username || url.password) throw new BlockedHostError("Remove the username and password from the link.");
  await resolvePublicHost(url.hostname);
  return url;
}

export type GuardedResponse = { status: number; ok: boolean; headers: Headers; text: () => Promise<string> };

/** fetch() for owner-supplied URLs: https only, public hosts only, no redirects, 10 s timeout. */
export async function guardedFetch(raw: string, init: Omit<UndiciRequestInit, "dispatcher" | "redirect" | "signal"> & { timeoutMs?: number }): Promise<GuardedResponse> {
  const url = await assertPublicHttpsUrl(raw);
  const { timeoutMs = 10_000, ...rest } = init;
  const response = await undiciFetch(url, { ...rest, redirect: "manual", dispatcher: guardedAgent(), signal: AbortSignal.timeout(timeoutMs) });
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    headers: response.headers as unknown as Headers,
    text: async () => (await response.text()).slice(0, 2000),
  };
}
