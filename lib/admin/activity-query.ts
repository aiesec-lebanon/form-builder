import type { Prisma } from "@prisma/client";

// Admin activity tables (sign-ins, all activity, reports): filters, sorting
// and pages, all from the URL so views can be bookmarked and shared.

export const PAGE_SIZE = 25;

export type ActivityTab = "signins" | "all" | "reports";
export type SortDir = "asc" | "desc";
export type ReportStatus = "open" | "reviewed" | "all";

/** Sortable columns per table. "when" is the default (newest first). */
export const SORT_KEYS = {
  signins: ["when", "member", "entity"],
  all: ["when", "event", "by"],
  reports: ["when", "form", "reason"],
} as const satisfies Record<ActivityTab, readonly string[]>;

export type ActivityQuery = {
  tab: ActivityTab;
  page: number;
  sort: string;
  dir: SortDir;
  /** Person: member (sign-ins) or who did it (all activity). Name or EXPA ID. */
  q: string;
  entity: string;
  device: string;
  event: string;
  /** Form title (all activity details, reports). */
  form: string;
  reason: string;
  status: ReportStatus;
  /** YYYY-MM-DD, inclusive, UTC. */
  from: string;
  to: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseActivityQuery(params: Record<string, string | string[] | undefined>): ActivityQuery {
  // "any" is what the filter menus send for "All …".
  const one = (key: string, max = 100) => {
    const value = typeof params[key] === "string" ? (params[key] as string).trim().slice(0, max) : "";
    return value === "any" ? "" : value;
  };
  const tab: ActivityTab = one("tab") === "all" ? "all" : one("tab") === "reports" ? "reports" : "signins";
  const sort = (SORT_KEYS[tab] as readonly string[]).includes(one("sort")) ? one("sort") : "when";
  const status: ReportStatus = one("status") === "reviewed" ? "reviewed" : one("status") === "all" ? "all" : "open";
  const date = (key: string) => (DATE.test(one(key)) && !Number.isNaN(Date.parse(`${one(key)}T00:00:00Z`)) ? one(key) : "");
  return {
    tab,
    page: Math.min(Math.max(Number.parseInt(one("page"), 10) || 1, 1), 10_000),
    sort,
    dir: one("dir") === "asc" ? "asc" : "desc",
    q: one("q"),
    entity: one("entity", 200),
    device: one("device", 60),
    event: one("event", 60),
    form: one("form"),
    reason: one("reason", 40),
    status,
    from: date("from"),
    to: date("to"),
  };
}

/** The URL of this view with some parts changed. Changing anything but the page goes back to page 1. */
export function activityHref(query: ActivityQuery, patch: Partial<ActivityQuery> = {}): string {
  const next = { ...query, page: "page" in patch ? (patch.page ?? 1) : 1, ...patch };
  const params = new URLSearchParams();
  if (next.tab !== "signins") params.set("tab", next.tab);
  const relevant: Record<ActivityTab, Array<keyof ActivityQuery>> = { signins: ["q", "entity", "device"], all: ["q", "event", "form"], reports: ["form", "reason"] };
  for (const key of relevant[next.tab]) if (next[key]) params.set(key, String(next[key]));
  if (next.tab === "reports" && next.status !== "open") params.set("status", next.status);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.sort !== "when") params.set("sort", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  const search = params.toString();
  return `/admin/activity${search ? `?${search}` : ""}`;
}

/** Whether any filter (not sort or page) is set. */
export function hasFilters(query: ActivityQuery): boolean {
  if (query.from || query.to) return true;
  if (query.tab === "signins") return Boolean(query.q || query.entity || query.device);
  if (query.tab === "all") return Boolean(query.q || query.event || query.form);
  return Boolean(query.form || query.reason || query.status !== "open");
}

/** createdAt between the from and to days (inclusive), or undefined. */
export function createdAtRange(query: Pick<ActivityQuery, "from" | "to">): { gte?: Date; lt?: Date } | undefined {
  const range: { gte?: Date; lt?: Date } = {};
  if (query.from) range.gte = new Date(`${query.from}T00:00:00Z`);
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    range.lt = end;
  }
  return range.gte || range.lt ? range : undefined;
}

const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });

/** Person filter: name contains, or the exact EXPA ID when it's a number. */
function personFilter(q: string): Prisma.UserWhereInput {
  return /^\d{1,18}$/.test(q) ? { OR: [{ fullName: contains(q) }, { aiesecPersonId: BigInt(q) }] } : { fullName: contains(q) };
}

/** Audit filters. `formIds` are the forms whose title matched the form filter (all activity). */
export function auditWhere(query: ActivityQuery, formIds?: string[]): Prisma.AuditEventWhereInput {
  const where: Prisma.AuditEventWhereInput = {};
  if (query.tab === "signins") where.type = "auth.sign_in";
  else if (query.event) where.type = query.event;
  const createdAt = createdAtRange(query);
  if (createdAt) where.createdAt = createdAt;
  const actor: Prisma.UserWhereInput = {
    ...(query.q ? personFilter(query.q) : {}),
    ...(query.tab === "signins" && query.entity ? { officeName: query.entity } : {}),
  };
  if (Object.keys(actor).length) where.actor = actor;
  if (query.tab === "signins" && query.device) where.userAgent = contains(query.device);
  if (query.tab === "all" && query.form) {
    where.targetType = "form";
    where.targetId = { in: formIds ?? [] };
  }
  return where;
}

export function auditOrderBy(query: ActivityQuery): Prisma.AuditEventOrderByWithRelationInput[] {
  const dir = query.dir;
  switch (query.sort) {
    case "member":
    case "by":
      return [{ actor: { fullName: dir } }, { id: "desc" }];
    case "entity":
      return [{ actor: { officeName: { sort: dir, nulls: "last" } } }, { id: "desc" }];
    case "event":
      return [{ type: dir }, { id: "desc" }];
    default:
      // Ids grow with time, and they're indexed.
      return [{ id: dir }];
  }
}

export function reportWhere(query: ActivityQuery): Prisma.FormReportWhereInput {
  const where: Prisma.FormReportWhereInput = {};
  if (query.status === "open") where.reviewedAt = null;
  if (query.status === "reviewed") where.reviewedAt = { not: null };
  if (query.reason) where.reason = query.reason;
  if (query.form) where.form = { title: contains(query.form) };
  const createdAt = createdAtRange(query);
  if (createdAt) where.createdAt = createdAt;
  return where;
}

export function reportOrderBy(query: ActivityQuery): Prisma.FormReportOrderByWithRelationInput[] {
  const dir = query.dir;
  if (query.sort === "form") return [{ form: { title: dir } }, { createdAt: "desc" }];
  if (query.sort === "reason") return [{ reason: dir }, { createdAt: "desc" }];
  return [{ createdAt: dir }];
}

/** Page bounds for a total: the page clamped to what exists, and the rows to skip. */
export function pageWindow(page: number, total: number): { page: number; pageCount: number; skip: number; first: number; last: number } {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const skip = (current - 1) * PAGE_SIZE;
  return { page: current, pageCount, skip, first: total === 0 ? 0 : skip + 1, last: Math.min(skip + PAGE_SIZE, total) };
}
