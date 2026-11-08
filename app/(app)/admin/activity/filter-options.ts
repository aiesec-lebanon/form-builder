import "server-only";

import type { Prisma } from "@prisma/client";

import type { ActivityTab } from "@/lib/admin/activity-query";
import { db } from "@/lib/db";
import { REPORT_REASON_LABEL, type ReportReason } from "@/lib/forms/reports";
import { describeUserAgent } from "@/lib/request";

import type { FilterOption } from "./FilterCombo";
import type { FilterOptions } from "./table-parts";

// The values each admin filter offers: only what actually appears in the data
// (grouped in the database, so it stays cheap as the log grows).

const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label);

type Person = { id: string; fullName: string; aiesecPersonId: bigint; officeName: string | null };
const personOption = (person: Person): FilterOption => ({ value: person.id, label: person.fullName, detail: [`EXPA ${person.aiesecPersonId}`, person.officeName].filter(Boolean).join(" · ") });
const formOption = (form: { id: string; title: string; slug: string }): FilterOption => ({ value: form.id, label: form.title || "Untitled form", detail: `/f/${form.slug}` });

/** People who appear as the actor of matching events. */
async function actors(where: Prisma.AuditEventWhereInput): Promise<Person[]> {
  const groups = await db.auditEvent.groupBy({ by: ["actorId"], where: { ...where, actorId: { not: null } } });
  const ids = groups.map((group) => group.actorId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  return db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, aiesecPersonId: true, officeName: true }, orderBy: { fullName: "asc" } });
}

async function formsById(ids: string[]): Promise<FilterOption[]> {
  if (ids.length === 0) return [];
  const forms = await db.form.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, slug: true }, orderBy: { title: "asc" } });
  return forms.map(formOption);
}

/**
 * Options for the tab's filters, plus the raw browser strings behind each
 * device label (the device filter matches those exactly).
 */
export async function filterOptions(tab: ActivityTab, eventLabels: Record<string, string>): Promise<{ options: FilterOptions; deviceAgents: Map<string, string[]> }> {
  const options: FilterOptions = { people: [], entities: [], devices: [], events: [], forms: [], reasons: [] };
  const deviceAgents = new Map<string, string[]>();

  if (tab === "signins") {
    const signIns: Prisma.AuditEventWhereInput = { type: "auth.sign_in" };
    const [people, agents] = await Promise.all([actors(signIns), db.auditEvent.groupBy({ by: ["userAgent"], where: { ...signIns, userAgent: { not: null } } })]);
    for (const { userAgent } of agents) {
      if (!userAgent) continue;
      const label = describeUserAgent(userAgent);
      deviceAgents.set(label, [...(deviceAgents.get(label) ?? []), userAgent]);
    }
    options.people = people.map(personOption);
    options.entities = [...new Set(people.map((person) => person.officeName).filter((name): name is string => Boolean(name)))].sort().map((name) => ({ value: name, label: name }));
    options.devices = [...deviceAgents.keys()].sort().map((label) => ({ value: label, label }));
  } else if (tab === "all") {
    const [people, types, targets] = await Promise.all([actors({}), db.auditEvent.groupBy({ by: ["type"] }), db.auditEvent.groupBy({ by: ["targetId"], where: { targetType: "form", targetId: { not: null } } })]);
    options.people = people.map(personOption);
    options.events = types.map(({ type }) => ({ value: type, label: eventLabels[type] ?? type })).sort(byLabel);
    options.forms = await formsById(targets.map((target) => target.targetId).filter((id): id is string => Boolean(id)));
  } else {
    const [reported, reasons] = await Promise.all([db.formReport.groupBy({ by: ["formId"] }), db.formReport.groupBy({ by: ["reason"] })]);
    options.forms = await formsById(reported.map((report) => report.formId));
    options.reasons = reasons.map(({ reason }) => ({ value: reason, label: REPORT_REASON_LABEL[reason as ReportReason] ?? reason })).sort(byLabel);
  }
  return { options, deviceAgents };
}
