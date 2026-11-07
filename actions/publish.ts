"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { prepareDestinations } from "@/lib/destinations/prepare";
import { getFormAccess } from "@/lib/forms/access";
import { publishProblems, type PublishProblem } from "@/lib/forms/publish-checks";
import { parseDocument } from "@/lib/forms/schema";
import { normalizeSlug, slugProblem } from "@/lib/forms/slug";
import { logger } from "@/lib/logger";
import { clientIp, userAgent } from "@/lib/request";

export type PublishOutcome =
  | { status: "published"; publishedAt: string; publishedRevision: number; warnings: string[] }
  | { status: "problems"; problems: PublishProblem[] }
  | { status: "stale" };

const SIGNED_OUT = "Your session ended. Sign in again to publish.";
const NOT_FOUND = "This form doesn't exist or you no longer have access to it.";

async function meta() {
  const list = await headers();
  return { ip: clientIp(list), userAgent: userAgent(list) };
}

/** Publishes the draft saved at `expectedRevision` (the client saves first). */
export async function publishForm(formId: string, expectedRevision: number): Promise<ActionResult<PublishOutcome>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return fail(NOT_FOUND);
  const { form } = access;
  if (form.revision !== expectedRevision) return ok({ status: "stale" });

  const doc = parseDocument(form.draft);
  if (!doc) return fail("This form couldn't be read. Undo your last change and try again.");

  const destinations = await db.destination.findMany({ where: { formId, enabled: true }, select: { id: true, role: true } });
  const problems = publishProblems(doc, {
    hasPrimaryDestination: destinations.some((destination) => destination.role === "primary"),
    hasFileStorage: destinations.some((destination) => destination.role === "files"),
  });
  if (problems.length > 0) return ok({ status: "problems", problems });

  // Get destinations ready for this version (e.g. add new Sheet columns).
  // Failures don't block publishing; delivery retries the same preparation.
  const warnings = await prepareDestinations(formId, doc);

  const now = new Date();
  const updated = await db.form.updateMany({
    where: { id: formId, revision: expectedRevision, deletedAt: null },
    data: { published: doc as unknown as Prisma.InputJsonValue, publishedRevision: expectedRevision, publishedAt: form.publishedAt ?? now },
  });
  if (updated.count === 0) return ok({ status: "stale" });

  await recordAudit({ type: "form.published", actorId: user.id, target: { type: "form", id: formId }, metadata: { revision: expectedRevision, firstPublish: !form.publishedAt }, ...(await meta()) });
  logger.info("form.published", { formId, revision: expectedRevision, warnings: warnings.length });
  revalidatePath(`/f/${form.slug}`);
  revalidatePath(`/embed/${form.slug}`);
  return ok({ status: "published", publishedAt: (form.publishedAt ?? now).toISOString(), publishedRevision: expectedRevision, warnings });
}

/** Changes the public link. Old links stop working. */
export async function updateSlug(formId: string, requested: string): Promise<ActionResult<{ slug: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return fail(NOT_FOUND);
  const slug = normalizeSlug(requested);
  const problem = slugProblem(slug);
  if (problem) return fail(problem, { fieldErrors: { slug: problem } });
  if (slug === access.form.slug) return ok({ slug });
  try {
    await db.form.update({ where: { id: formId }, data: { slug } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("That link is already taken. Try another.", { fieldErrors: { slug: "That link is already taken. Try another." } });
    }
    throw error;
  }
  revalidatePath(`/f/${access.form.slug}`);
  revalidatePath(`/f/${slug}`);
  return ok({ slug });
}

/** Opens or closes the live form to new responses. */
export async function setAcceptingResponses(formId: string, accepting: boolean): Promise<ActionResult<{ acceptingResponses: boolean }>> {
  const user = await getCurrentUser();
  if (!user) return fail(SIGNED_OUT);
  const access = await getFormAccess(formId, user.id, "edit");
  if (!access) return fail(NOT_FOUND);
  await db.form.update({ where: { id: formId }, data: { acceptingResponses: accepting } });
  await recordAudit({ type: accepting ? "form.reopened" : "form.closed", actorId: user.id, target: { type: "form", id: formId }, ...(await meta()) });
  revalidatePath(`/f/${access.form.slug}`);
  return ok({ acceptingResponses: accepting });
}
