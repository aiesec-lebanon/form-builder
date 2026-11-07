"use server";

import { Prisma } from "@prisma/client";
import { headers } from "next/headers";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { encryptJson } from "@/lib/crypto";
import { db } from "@/lib/db";
import { testDestination } from "@/lib/destinations/deliver";
import { classifyError } from "@/lib/destinations/errors";
import { initialHeaderRow, syncColumns } from "@/lib/destinations/google-sheets";
import { parseConnectionString } from "@/lib/destinations/postgres";
import { listSummaries, loadDestination, recordHealth } from "@/lib/destinations/store";
import { IDENTIFIER, type DestinationRole, type DestinationSummary, type DestinationType, type LoadedDestination } from "@/lib/destinations/types";
import { newSigningSecret } from "@/lib/destinations/webhook";
import { googleConfigured } from "@/lib/env";
import { getFormAccess } from "@/lib/forms/access";
import { parseDocument } from "@/lib/forms/schema";
import { createFolder, createSpreadsheet } from "@/lib/google/api";
import { googleAccessToken } from "@/lib/google/tokens";
import { logger } from "@/lib/logger";
import { assertPublicHttpsUrl, BlockedHostError } from "@/lib/net/guard";
import { clientIp, userAgent } from "@/lib/request";

type Destinations = { destinations: DestinationSummary[] };

const SIGNED_OUT = "Your session ended. Sign in again to continue.";
const NOT_FOUND = "This form doesn't exist or you no longer have access to it.";

async function authorize(formId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: SIGNED_OUT };
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return { ok: false as const, error: NOT_FOUND };
  return { ok: true as const, user, form: access.form };
}

async function meta() {
  const list = await headers();
  return { ip: clientIp(list), userAgent: userAgent(list) };
}

/** Creates a destination as primary if the form has none, otherwise as secondary. */
async function insertDestination(input: {
  formId: string;
  userId: string;
  type: DestinationType;
  name: string;
  config: Record<string, unknown>;
  secrets?: Record<string, unknown>;
  googleConnectionId?: string;
  role?: DestinationRole;
}) {
  const hasPrimary = (await db.destination.count({ where: { formId: input.formId, role: "primary" } })) > 0;
  const role: DestinationRole = input.role ?? (hasPrimary ? "secondary" : "primary");
  const data = {
    formId: input.formId,
    type: input.type,
    role,
    name: input.name,
    config: input.config as Prisma.InputJsonValue,
    secretsEnc: input.secrets ? encryptJson(input.secrets) : null,
    googleConnectionId: input.googleConnectionId ?? null,
    createdById: input.userId,
  };
  try {
    return await db.destination.create({ data });
  } catch (error) {
    // Two primaries raced: the unique partial index wins; keep this one as secondary.
    if (role === "primary" && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.destination.create({ data: { ...data, role: "secondary" } });
    }
    throw error;
  }
}

async function afterAdd(formId: string, userId: string, destinationId: string, type: DestinationType): Promise<DestinationSummary[]> {
  await recordAudit({ type: "destination.added", actorId: userId, target: { type: "form", id: formId }, metadata: { destinationId, destinationType: type }, ...(await meta()) });
  return listSummaries(formId);
}

function transient(formId: string, type: DestinationType, config: Record<string, unknown>, secrets: Record<string, unknown>): LoadedDestination {
  return { id: "unsaved", formId, type, role: "secondary", name: "", config, secrets, googleConnectionId: null };
}

function hostProblem(error: unknown): string {
  if (error instanceof BlockedHostError) return error.message;
  return "We couldn't find that address. Check the link.";
}

// --- Webhook -------------------------------------------------------------------

export async function addWebhook(formId: string, input: { url: string }): Promise<ActionResult<Destinations & { signingSecret: string }>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const url = z.string().trim().max(2000).safeParse(input.url);
  if (!url.success || !url.data) return fail("Enter the webhook URL.", { fieldErrors: { url: "Enter the webhook URL." } });
  try {
    await assertPublicHttpsUrl(url.data);
  } catch (error) {
    return fail(hostProblem(error), { fieldErrors: { url: hostProblem(error) } });
  }
  const signingSecret = newSigningSecret();
  const destination = await insertDestination({ formId, userId: auth.user.id, type: "webhook", name: "Webhook", config: { url: url.data }, secrets: { signingSecret } });
  return ok({ destinations: await afterAdd(formId, auth.user.id, destination.id, "webhook"), signingSecret });
}

export async function revealWebhookSecret(formId: string, destinationId: string): Promise<ActionResult<{ signingSecret: string }>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const destination = await loadDestination(formId, destinationId);
  const secret = destination?.type === "webhook" ? destination.secrets?.signingSecret : undefined;
  if (typeof secret !== "string") return fail("This webhook has no signing secret.");
  return ok({ signingSecret: secret });
}

// --- Supabase -------------------------------------------------------------------

const supabaseInput = z.object({
  projectUrl: z.string().trim().min(1, "Enter your project URL."),
  schema: z.string().trim().default("public"),
  table: z.string().trim().min(1, "Enter the table name."),
  apiKey: z.string().trim().min(20, "Paste your project's API key."),
});

export async function addSupabase(formId: string, raw: z.input<typeof supabaseInput>): Promise<ActionResult<Destinations>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const parsed = supabaseInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
    return fail("Check the highlighted fields.", { fieldErrors });
  }
  const input = parsed.data;
  if (!IDENTIFIER.test(input.table)) return fail("Check the table name.", { fieldErrors: { table: "Use letters, numbers and underscores." } });
  if (!IDENTIFIER.test(input.schema)) return fail("Check the schema name.", { fieldErrors: { schema: "Use letters, numbers and underscores." } });
  let projectUrl: string;
  try {
    projectUrl = (await assertPublicHttpsUrl(input.projectUrl)).origin;
  } catch (error) {
    return fail(hostProblem(error), { fieldErrors: { projectUrl: hostProblem(error) } });
  }

  const config = { projectUrl, schema: input.schema, table: input.table };
  const secrets = { apiKey: input.apiKey };
  const check = await testDestination(transient(formId, "supabase", config, secrets));
  if (!check.ok) return fail(check.message);

  const destination = await insertDestination({ formId, userId: auth.user.id, type: "supabase", name: "Supabase", config, secrets });
  await recordHealth(destination.id, check);
  return ok({ destinations: await afterAdd(formId, auth.user.id, destination.id, "supabase") });
}

// --- PostgreSQL -------------------------------------------------------------------

const postgresInput = z.object({
  connectionString: z.string().trim().min(10, "Paste your connection string."),
  schema: z.string().trim().default("public"),
  table: z.string().trim().min(1, "Enter the table name."),
});

export async function addPostgres(formId: string, raw: z.input<typeof postgresInput>): Promise<ActionResult<Destinations>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const parsed = postgresInput.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
    return fail("Check the highlighted fields.", { fieldErrors });
  }
  const input = parsed.data;
  if (!IDENTIFIER.test(input.table)) return fail("Check the table name.", { fieldErrors: { table: "Use letters, numbers and underscores." } });
  if (!IDENTIFIER.test(input.schema)) return fail("Check the schema name.", { fieldErrors: { schema: "Use letters, numbers and underscores." } });
  const connection = parseConnectionString(input.connectionString);
  if ("error" in connection) return fail(connection.error, { fieldErrors: { connectionString: connection.error } });

  const config = { host: connection.host, database: connection.database, schema: input.schema, table: input.table };
  const secrets = { connectionString: input.connectionString };
  const check = await testDestination(transient(formId, "postgres", config, secrets));
  if (!check.ok) return fail(check.message);

  const destination = await insertDestination({ formId, userId: auth.user.id, type: "postgres", name: "PostgreSQL", config, secrets });
  await recordHealth(destination.id, check);
  return ok({ destinations: await afterAdd(formId, auth.user.id, destination.id, "postgres") });
}

// --- Google -------------------------------------------------------------------

async function usableConnection(userId: string, connectionId: string) {
  const connection = await db.googleConnection.findFirst({ where: { id: connectionId, userId, status: "active" } });
  return connection;
}

export async function addGoogleSheet(formId: string, input: { connectionId: string }): Promise<ActionResult<Destinations>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  if (!googleConfigured()) return fail("Google isn't set up on this server yet.");
  const connection = await usableConnection(auth.user.id, input.connectionId);
  if (!connection) return fail("Connect your Google account first.");
  const doc = parseDocument(auth.form.draft);
  if (!doc) return fail("This form couldn't be read.");
  try {
    const token = await googleAccessToken(connection.id);
    const title = `${doc.title.trim() || "Untitled form"} — Responses`;
    const sheet = await createSpreadsheet(token, title, initialHeaderRow(doc));
    const config = { ...sheet, columns: syncColumns([], doc).columns };
    const destination = await insertDestination({ formId, userId: auth.user.id, type: "google_sheets", name: "Google Sheets", config, googleConnectionId: connection.id });
    return ok({ destinations: await afterAdd(formId, auth.user.id, destination.id, "google_sheets") });
  } catch (error) {
    logger.warn("destination.sheet_create_failed", { formId, error });
    const result = classifyError(error);
    return fail(result.ok ? "Couldn't create the Sheet." : result.message);
  }
}

export async function addGoogleDrive(formId: string, input: { connectionId: string }): Promise<ActionResult<Destinations>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  if (!googleConfigured()) return fail("Google isn't set up on this server yet.");
  if (await db.destination.count({ where: { formId, role: "files" } })) return fail("This form already saves uploads to Google Drive.");
  const connection = await usableConnection(auth.user.id, input.connectionId);
  if (!connection) return fail("Connect your Google account first.");
  const doc = parseDocument(auth.form.draft);
  try {
    const token = await googleAccessToken(connection.id);
    const folder = await createFolder(token, `${doc?.title.trim() || "Untitled form"} — Uploads`);
    const destination = await insertDestination({
      formId,
      userId: auth.user.id,
      type: "google_drive",
      role: "files",
      name: "Google Drive",
      config: { folderId: folder.id, folderUrl: folder.webViewLink },
      googleConnectionId: connection.id,
    });
    await recordHealth(destination.id, { ok: true });
    return ok({ destinations: await afterAdd(formId, auth.user.id, destination.id, "google_drive") });
  } catch (error) {
    logger.warn("destination.folder_create_failed", { formId, error });
    const result = classifyError(error);
    return fail(result.ok ? "Couldn't create the folder." : result.message);
  }
}

// --- Common -------------------------------------------------------------------

export async function testDestinationAction(formId: string, destinationId: string): Promise<ActionResult<Destinations & { passed: boolean; message: string | null }>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const destination = await loadDestination(formId, destinationId);
  if (!destination) return fail("That destination was removed.");
  const result = await testDestination(destination);
  await recordHealth(destination.id, result);
  return ok({ destinations: await listSummaries(formId), passed: result.ok, message: result.ok ? null : result.message });
}

export async function removeDestination(formId: string, destinationId: string): Promise<ActionResult<Destinations>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const destination = await db.destination.findFirst({ where: { id: destinationId, formId } });
  if (!destination) return ok({ destinations: await listSummaries(formId) });
  await db.$transaction(async (tx) => {
    await tx.destination.delete({ where: { id: destination.id } });
    if (destination.role === "primary") {
      const next = await tx.destination.findFirst({ where: { formId, role: "secondary" }, orderBy: { createdAt: "asc" } });
      if (next) await tx.destination.update({ where: { id: next.id }, data: { role: "primary" } });
    }
  });
  await recordAudit({ type: "destination.removed", actorId: auth.user.id, target: { type: "form", id: formId }, metadata: { destinationId, destinationType: destination.type }, ...(await meta()) });
  return ok({ destinations: await listSummaries(formId) });
}

export async function makePrimary(formId: string, destinationId: string): Promise<ActionResult<Destinations>> {
  const auth = await authorize(formId);
  if (!auth.ok) return fail(auth.error);
  const target = await db.destination.findFirst({ where: { id: destinationId, formId, role: "secondary" } });
  if (!target) return ok({ destinations: await listSummaries(formId) });
  await db.$transaction([
    db.destination.updateMany({ where: { formId, role: "primary" }, data: { role: "secondary" } }),
    db.destination.update({ where: { id: target.id }, data: { role: "primary" } }),
  ]);
  return ok({ destinations: await listSummaries(formId) });
}
