import type { Metadata } from "next";
import NextLink from "next/link";

import { Avatar, cx } from "@/components/aiesec";
import { activityHref, auditOrderBy, auditWhere, hasFilters, PAGE_SIZE, pageWindow, parseActivityQuery, reportOrderBy, reportWhere, type ActivityTab } from "@/lib/admin/activity-query";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { formatCount } from "@/lib/format";
import { describeUserAgent } from "@/lib/request";

import { ActivityPagination } from "./ActivityPagination";
import { filterOptions } from "./filter-options";
import { ReportsTable } from "./ReportsList";
import { Filters, PlainHeader, ResultCount, SortHeader, When } from "./table-parts";

export const metadata: Metadata = { title: "Activity", robots: { index: false } };

const EVENT_LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sign_in_refused": "Sign-in refused",
  "auth.sign_out": "Signed out",
  "form.created": "Created a form",
  "form.published": "Published a form",
  "form.closed": "Closed a form",
  "form.reopened": "Reopened a form",
  "form.embed_sites_changed": "Changed where a form can be embedded",
  "form.trashed": "Moved a form to trash",
  "form.restored": "Restored a form",
  "form.ownership_transferred": "Transferred ownership",
  "form.reported": "Reported a form",
  "form.report_reviewed": "Reviewed a report",
  "collaborator.added": "Added an editor",
  "collaborator.removed": "Removed an editor",
  "destination.added": "Connected a destination",
  "destination.removed": "Removed a destination",
  "google.connected": "Connected Google",
  "google.disconnected": "Disconnected Google",
  "google.folder_moved": "Moved the AIESEC Forms folder",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Per-request server render, so reading the clock here is intended. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-5">
      <span className="ae-body-sm text-text-muted">{label}</span>
      <span className="ae-h2 text-text">{formatCount(value)}</span>
    </div>
  );
}

const actorSelect = { select: { fullName: true, photoUrl: true, officeName: true, positionTitle: true, aiesecPersonId: true } } as const;
const reportInclude = { form: { select: { id: true, title: true, slug: true, acceptingResponses: true, deletedAt: true, owner: { select: { fullName: true, email: true, aiesecEmail: true } } } } } as const;

export default async function ActivityPage({ searchParams }: Props) {
  await requireAdmin();
  const query = parseActivityQuery(await searchParams);
  const filtered = hasFilters(query);

  const [members, signIns, forms, liveForms, openReports, { options, deviceAgents }] = await Promise.all([
    db.user.count(),
    db.auditEvent.count({ where: { type: "auth.sign_in", createdAt: { gte: daysAgo(7) } } }),
    db.form.count({ where: { deletedAt: null } }),
    db.form.count({ where: { deletedAt: null, publishedAt: { not: null }, acceptingResponses: true } }),
    db.formReport.count({ where: { reviewedAt: null } }),
    filterOptions(query.tab, EVENT_LABELS),
  ]);

  let table: React.ReactNode;
  let pages: ReturnType<typeof pageWindow>;
  let total: number;

  if (query.tab === "reports") {
    const where = reportWhere(query);
    total = await db.formReport.count({ where });
    pages = pageWindow(query.page, total);
    const reports = await db.formReport.findMany({ where, orderBy: reportOrderBy(query), skip: pages.skip, take: PAGE_SIZE, include: reportInclude });
    table = <ReportsTable query={query} reports={reports} filtered={filtered} />;
  } else {
    const where = auditWhere(query, deviceAgents.get(query.device));
    total = await db.auditEvent.count({ where });
    pages = pageWindow(query.page, total);
    const rows = await db.auditEvent.findMany({ where, orderBy: auditOrderBy(query), skip: pages.skip, take: PAGE_SIZE, include: { actor: actorSelect } });
    const targetIds = [...new Set(rows.filter((row) => row.targetType === "form" && row.targetId).map((row) => row.targetId as string))];
    const formTitles = new Map((targetIds.length ? await db.form.findMany({ where: { id: { in: targetIds } }, select: { id: true, title: true } }) : []).map((form) => [form.id, form.title]));
    const signins = query.tab === "signins";

    table = (
      <div className="ae-table-wrap">
        <table className="ae-table min-w-[44rem]">
          <caption className="ae-sr-only">{signins ? "Sign-ins" : "Activity"}</caption>
          <thead>
            <tr>
              <SortHeader query={query} column={signins ? "member" : "event"}>
                {signins ? "Member" : "Event"}
              </SortHeader>
              <SortHeader query={query} column={signins ? "entity" : "by"}>
                {signins ? "Entity and position" : "By"}
              </SortHeader>
              <PlainHeader>{signins ? "Device" : "Details"}</PlainHeader>
              <SortHeader query={query} column="when">
                When
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="ae-table__empty ae-body-sm">
                  {filtered ? `No ${signins ? "sign-ins" : "activity"} matches these filters.` : "Nothing here yet."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const meta = (row.metadata ?? {}) as Record<string, unknown>;
                const name = row.actor?.fullName ?? (row.type === "auth.sign_in_refused" ? `EXPA ${String(meta.aiesecPersonId ?? "unknown")}` : "System");
                return (
                  <tr key={row.id.toString()}>
                    <td>
                      {signins ? (
                        <span className="flex items-center gap-3">
                          <Avatar name={name} src={row.actor?.photoUrl ?? undefined} size="sm" decorative />
                          <span className="flex flex-col">
                            <span className="ae-label text-text">{name}</span>
                            {row.actor && <span className="ae-caption text-text-muted">EXPA {row.actor.aiesecPersonId.toString()}</span>}
                          </span>
                        </span>
                      ) : (
                        <span className="ae-label text-text">{EVENT_LABELS[row.type] ?? row.type}</span>
                      )}
                    </td>
                    <td className="ae-body-sm text-text">{signins ? [row.actor?.officeName ?? (meta.office as string | undefined), row.actor?.positionTitle].filter(Boolean).join(" · ") || "—" : name}</td>
                    <td className="ae-body-sm text-text-muted">
                      {signins
                        ? describeUserAgent(row.userAgent)
                        : row.targetType === "form" && row.targetId
                          ? (formTitles.get(row.targetId) ?? "Deleted form")
                          : row.type === "auth.sign_in_refused"
                            ? "No current EXPA position"
                            : "—"}
                    </td>
                    <td>
                      <When date={row.createdAt} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    );
  }

  const tabLink = (id: ActivityTab, label: string) => (
    <NextLink
      href={activityHref({ ...query, tab: id, sort: "when", dir: "desc" })}
      aria-current={query.tab === id ? "page" : undefined}
      className={cx(
        "inline-flex h-10 items-center rounded-md px-3 ae-label no-underline",
        query.tab === id ? "bg-surface text-text shadow-[var(--ae-shadow-xs),inset_0_0_0_1px_var(--ae-border)]" : "text-text-muted hover:bg-fill hover:text-text",
      )}
    >
      {label}
    </NextLink>
  );

  return (
    <div className="ae-container flex flex-col gap-8 py-8 lg:py-12">
      <div className="flex flex-col gap-1">
        <h1 className="ae-h2">Activity</h1>
        <p className="ae-body text-text-muted">Who signed in, what changed, and reports about forms. Response data is never recorded here.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Members signed up" value={members} />
        <Stat label="Sign-ins, last 7 days" value={signIns} />
        <Stat label="Forms" value={forms} />
        <Stat label="Live forms" value={liveForms} />
      </div>

      <div className="flex flex-col gap-4">
        <nav aria-label="Activity views" className="flex flex-wrap gap-1">
          {tabLink("signins", "Sign-ins")}
          {tabLink("all", "All activity")}
          {tabLink("reports", openReports > 0 ? `Reports (${formatCount(openReports)} open)` : "Reports")}
        </nav>
        {/* Keyed by the URL so the controls reset after applying or clearing filters. */}
        <Filters key={activityHref(query)} query={query} options={options} />
      </div>

      <div className="flex flex-col gap-3">
        <ResultCount first={pages.first} last={pages.last} total={total} noun={{ signins: "sign-ins", all: "events", reports: "reports" }[query.tab]} />
        {table}
        <ActivityPagination query={query} page={pages.page} pageCount={pages.pageCount} />
      </div>
    </div>
  );
}
