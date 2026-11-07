import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

// Prisma 7 + pg driver adapter over Supabase's transaction pooler (ADR-005).
// TLS is always on for remote hosts; the certificate is verified when
// DATABASE_CA_CERT is provided (Supabase's CA is not in the public trust store).

function sslFor(connectionString: string) {
  const host = new URL(connectionString).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  const ca = env().DATABASE_CA_CERT;
  return ca ? { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true } : { rejectUnauthorized: false };
}

function createClient(): PrismaClient {
  const { DATABASE_URL, NODE_ENV } = env();
  const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
    ssl: sslFor(DATABASE_URL),
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter, log: NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

// One client per process; reused across hot reloads in development, where a
// fresh client per reload exhausts the pooler's connections.
const globalForDb = globalThis as unknown as { __db?: PrismaClient };

function client(): PrismaClient {
  if (!globalForDb.__db) globalForDb.__db = createClient();
  return globalForDb.__db;
}

/** Created on first use so builds and tests that never query need no database. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = client();
    const value = Reflect.get(real, property);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
