import type { Metadata } from "next";
import NextLink from "next/link";

import { Avatar, cx } from "@/components/aiesec";
import { RelativeTime } from "@/components/app/RelativeTime";
import { requireAdmin } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { formatCount, shortDate } from "@/lib/format";
import { describeUserAgent } from "@/lib/request";

export const metadata: Metadata = { title: "Activity", robots: { index: false } };

const PAGE_SIZE = 50;

const EVENT_LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "auth.sign_in_refused": "Sign-in refused",
  "auth.sign_out": "Signed out",
  "form.created": "Created a form",
  "form.published": "Published a form",
  "form.closed": "Closed a form",
  "form.reopened": "Reopened a form",
  "form.trashed": "Moved a form to trash",
  "form.restored": "Restored a form",
  "form.ownership_transferred": "Transferred ownership",
  "collaborator.added": "Added an editor",
  "collaborator.removed": "Removed an editor",
  "destination.added": "Connected a destination",
  "destination.removed": "Removed a destination",
  "google.connected": "Connected Google",
  "google.disconnected": "Disconnected Google",
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

function When({ date }: { date: Date }) {
  return (
    <span className="flex flex-col">
      <span className="ae-body-sm text-text">
        {shortDate(date)}, {date.toISOString().slice(11, 16)} UTC
      </span>
      <span className="ae-caption text-text-muted">
        <RelativeTime value={date} />
      </span>
    </span>
  );
}

export default async function ActivityPage({ searchParams }: Props) {
  await requireAdmin();
  const params = await searchParams;
  const tab = params.tab === "all" ? "all" : "signins";
  const before = typeof params.before === "string" && /^\d{1,19}$/.test(params.before) ? BigInt(params.before) : undefined;

  const since = daysAgo(7);
  const [events, members, signIns, forms, liveForms] = await Promise.all([
    db.auditEvent.findMany({
      where: { ...(tab === "signins" ? { type: "auth.sign_in" } : {}), ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: "desc" },
      take: PAGE_SIZE + 1,
      include: { actor: { select: { fullName: true, photoUrl: true, officeName: true, positionTitle: true, aiesecPersonId: true } } },
    }),
    db.user.count(),
    db.auditEvent.count({ where: { type: "auth.sign_in", createdAt: { gte: since } } }),
    db.form.count({ where: { deletedAt: null } }),
    db.form.count({ where: { deletedAt: null, publishedAt: { not: null }, acceptingResponses: true } }),
  ]);
  const rows = events.slice(0, PAGE_SIZE);
  const hasMore = events.length > PAGE_SIZE;

  const formIds = [...new Set(rows.filter((row) => row.targetType === "form" && row.targetId).map((row) => row.targetId as string))];
  const formTitles = new Map((formIds.length ? await db.form.findMany({ where: { id: { in: formIds } }, select: { id: true, title: true } }) : []).map((form) => [form.id, form.title]));

  const tabLink = (id: "signins" | "all", label: string) => (
    <NextLink
      href={`/admin/activity${id === "all" ? "?tab=all" : ""}`}
      aria-current={tab === id ? "page" : undefined}
      className={cx("inline-flex h-10 items-center rounded-md px-3 ae-label no-underline", tab === id ? "bg-surface text-text shadow-[var(--ae-shadow-xs),inset_0_0_0_1px_var(--ae-border)]" : "text-text-muted hover:bg-fill hover:text-text")}
    >
      {label}
    </NextLink>
  );

  return (
    <div className="ae-container flex flex-col gap-8 py-8 lg:py-12">
      <div className="flex flex-col gap-1">
        <h1 className="ae-h2">Activity</h1>
        <p className="ae-body text-text-muted">Who signed in and what changed. Response data is never recorded here.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Members signed up" value={members} />
        <Stat label="Sign-ins, last 7 days" value={signIns} />
        <Stat label="Forms" value={forms} />
        <Stat label="Live forms" value={liveForms} />
      </div>

      <nav aria-label="Activity views" className="flex gap-1">
        {tabLink("signins", "Sign-ins")}
        {tabLink("all", "All activity")}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-8 ae-body text-text-muted">Nothing here yet.</p>
      ) : (
        <div className="ae-table-wrap">
          <table className="ae-table">
            <caption className="ae-sr-only">{tab === "signins" ? "Recent sign-ins" : "Recent activity"}</caption>
            <thead>
              <tr>
                <th scope="col" className="ae-label">
                  {tab === "signins" ? "Member" : "Event"}
                </th>
                <th scope="col" className="ae-label">
                  {tab === "signins" ? "Entity and position" : "By"}
                </th>
                <th scope="col" className="ae-label">
                  {tab === "signins" ? "Device" : "Details"}
                </th>
                <th scope="col" className="ae-label">
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const meta = (row.metadata ?? {}) as Record<string, unknown>;
                const name = row.actor?.fullName ?? (row.type === "auth.sign_in_refused" ? `EXPA ${String(meta.aiesecPersonId ?? "unknown")}` : "System");
                return (
                  <tr key={row.id.toString()}>
                    <td>
                      {tab === "signins" ? (
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
                    <td className="ae-body-sm text-text">
                      {tab === "signins" ? [row.actor?.officeName ?? (meta.office as string | undefined), row.actor?.positionTitle].filter(Boolean).join(" · ") || "—" : name}
                    </td>
                    <td className="ae-body-sm text-text-muted">
                      {tab === "signins"
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
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3">
        {before && (
          <NextLink className="ae-btn ae-btn--secondary ae-body no-underline" href={`/admin/activity${tab === "all" ? "?tab=all" : ""}`}>
            Newest
          </NextLink>
        )}
        {hasMore && (
          <NextLink className="ae-btn ae-btn--secondary ae-body no-underline" href={`/admin/activity?${tab === "all" ? "tab=all&" : ""}before=${rows[rows.length - 1].id.toString()}`}>
            Older
          </NextLink>
        )}
      </div>
    </div>
  );
}
