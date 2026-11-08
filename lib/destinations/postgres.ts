import "server-only";

import { isIP } from "node:net";

import pg from "pg";

import { buildRowData } from "@/lib/forms/payload";
import { logger } from "@/lib/logger";
import { BlockedHostError, resolvePublicHost } from "@/lib/net/guard";

import { failure, IDENTIFIER, postgresConfig, postgresSecrets, success, type DeliveryResult, type DestinationAdapter } from "./types";

// The owner's own PostgreSQL. TLS required (certificate not verified, like
// libpq sslmode=require); we connect to the vetted public IP with SNI set to the
// hostname, so DNS rebinding can't redirect us. One short connection per call.
// Setup SQL: lib/destinations/sql.ts.

export type ParsedConnection = { host: string; port: number; user: string; password: string; database: string };

/** Parses postgres:// URLs. Returns a reason instead of throwing, for form errors. */
export function parseConnectionString(raw: string): ParsedConnection | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "That doesn't look like a connection string. It starts with postgresql://" };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return { error: "The connection string must start with postgresql://" };
  if (url.searchParams.get("sslmode") === "disable") return { error: "Connections must use TLS. Remove sslmode=disable." };
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres";
  if (!url.hostname || !url.username) return { error: "Include the user and host, like postgresql://user:password@host:5432/db" };
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port ? Number(url.port) : 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

export const quoteIdent = (name: string) => {
  if (!IDENTIFIER.test(name)) throw new Error("Invalid identifier");
  return `"${name}"`;
};

/** Readable, credential-free messages for common Postgres errors. */
export function describePgError(error: unknown): DeliveryResult {
  if (error instanceof BlockedHostError) return failure(error.message, false);
  const code = (error as { code?: string }).code ?? "";
  switch (code) {
    case "INVALID_CONNECTION":
      return failure((error as Error).message, false);
    case "28P01":
    case "28000":
      return failure("The database rejected the username or password.", false);
    case "3D000":
      return failure("That database doesn't exist.", false);
    case "42P01":
      return failure("The table doesn't exist. Run the setup SQL first.", false);
    case "42703":
      return failure("The table is missing a column. It needs response_id, form_id, submitted_at and data.", false);
    case "42501":
      return failure("The database user isn't allowed to insert into that table.", false);
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return failure("Couldn't find that database host.");
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "ECONNRESET":
      return failure("Couldn't connect to the database.");
    default:
      return failure("The database didn't accept the response.");
  }
}

async function withClient<T>(connectionString: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const parsed = parseConnectionString(connectionString);
  if ("error" in parsed) throw Object.assign(new Error(parsed.error), { code: "INVALID_CONNECTION" });
  const [address] = await resolvePublicHost(parsed.host);
  const client = new pg.Client({
    host: address.address,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    ssl: { rejectUnauthorized: false, servername: isIP(parsed.host) ? undefined : parsed.host },
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: "aiesec-forms",
  });
  client.on("error", (error) => logger.warn("postgres.client_error", { code: (error as { code?: string }).code }));
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

function parse(destination: { config: unknown; secrets: unknown }) {
  const config = postgresConfig.safeParse(destination.config);
  const secrets = postgresSecrets.safeParse(destination.secrets);
  return config.success && secrets.success ? { ...config.data, connectionString: secrets.data.connectionString } : null;
}

export const postgresAdapter: DestinationAdapter = {
  type: "postgres",
  async deliver(destination, { payload }) {
    const parsed = parse(destination);
    if (!parsed) return failure("This database connection's settings are incomplete. Remove it and add it again.", false);
    try {
      await withClient(parsed.connectionString, (client) =>
        client.query(
          `INSERT INTO ${quoteIdent(parsed.schema)}.${quoteIdent(parsed.table)} (response_id, form_id, submitted_at, data) VALUES ($1, $2, $3, $4) ON CONFLICT (response_id) DO NOTHING`,
          [payload.responseId, payload.form.id, payload.submittedAt, JSON.stringify(buildRowData(payload.answers, payload.respondent))],
        ),
      );
      return success;
    } catch (error) {
      return describePgError(error);
    }
  },
  async test(destination) {
    const parsed = parse(destination);
    if (!parsed) return failure("This database connection's settings are incomplete. Remove it and add it again.", false);
    try {
      const missing = await withClient(parsed.connectionString, async (client) => {
        await client.query(`SELECT 1 FROM ${quoteIdent(parsed.schema)}.${quoteIdent(parsed.table)} LIMIT 0`);
        const { rows } = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2", [parsed.schema, parsed.table]);
        const present = new Set(rows.map((row) => row.column_name));
        return ["response_id", "form_id", "submitted_at", "data"].filter((column) => !present.has(column));
      });
      return missing.length ? failure(`The table is missing: ${missing.join(", ")}. Run the setup SQL.`, false) : success;
    } catch (error) {
      return describePgError(error);
    }
  },
};
