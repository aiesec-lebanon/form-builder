import "server-only";

import { cookies } from "next/headers";

import { RESPONDENT_COOKIE, unsealRespondent, type Respondent } from "@/lib/auth/respondent";
import { getSession } from "@/lib/auth/current-user";
import { hmacBase64Url } from "@/lib/crypto";
import { db } from "@/lib/db";

import type { FormAccess } from "./schema";

// Respondents of AIESEC-only forms (ADR-013): who is answering, whether they may,
// and the one-response-per-person record (a keyed hash, never the person id).

export type CurrentRespondent = Respondent & { source: "respondent" | "app" };

/** The respondent cookie first ("Not you?" clears it); otherwise a signed-in member of this app. */
export async function currentRespondent(): Promise<CurrentRespondent | null> {
  const store = await cookies();
  const respondent = await unsealRespondent(store.get(RESPONDENT_COOKIE)?.value);
  if (respondent) return { ...respondent, source: "respondent" };
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.uid }, select: { aiesecPersonId: true, fullName: true, email: true, aiesecEmail: true, positionTitle: true } });
  if (!user) return null;
  return { aiesecId: user.aiesecPersonId.toString(), name: user.fullName, email: user.aiesecEmail ?? user.email, member: Boolean(user.positionTitle), source: "app" };
}

export type AccessProblem = "sign_in" | "members_only" | "already_responded";

/** Whether this person may answer. Pure, so the page, the submit API and tests agree. */
export function accessProblem(access: FormAccess, respondent: Respondent | null, alreadyResponded: boolean): AccessProblem | null {
  if (access.mode !== "aiesec") return null;
  if (!respondent) return "sign_in";
  if (access.membersOnly && !respondent.member) return "members_only";
  if (access.onePerPerson && alreadyResponded) return "already_responded";
  return null;
}

export function respondentKey(formId: string, aiesecId: string): string {
  return hmacBase64Url("form-respondent-v1", `${formId}:${aiesecId}`);
}

export async function hasResponded(formId: string, aiesecId: string): Promise<boolean> {
  const row = await db.formRespondent.findUnique({ where: { formId_respondentKey: { formId, respondentKey: respondentKey(formId, aiesecId) } }, select: { formId: true } });
  return Boolean(row);
}

/**
 * Claims this person's one response before delivery. True when the claim is
 * new or belongs to the same responseId (a retry); false when they already responded.
 */
export async function claimResponse(formId: string, aiesecId: string, responseId: string): Promise<boolean> {
  const key = respondentKey(formId, aiesecId);
  const created = await db.formRespondent.createMany({ data: [{ formId, respondentKey: key, responseId }], skipDuplicates: true });
  if (created.count === 1) return true;
  const existing = await db.formRespondent.findUnique({ where: { formId_respondentKey: { formId, respondentKey: key } }, select: { responseId: true } });
  return existing?.responseId === responseId;
}

/** Gives the claim back when delivery failed, so they can try again. */
export async function releaseResponse(formId: string, aiesecId: string, responseId: string): Promise<void> {
  await db.formRespondent.deleteMany({ where: { formId, respondentKey: respondentKey(formId, aiesecId), responseId } });
}
