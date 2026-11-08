import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import NextLink from "next/link";

import { Button, Select, TextField } from "@/components/aiesec";
import { RelativeTime } from "@/components/app/RelativeTime";
import { activityHref, hasFilters, type ActivityQuery } from "@/lib/admin/activity-query";
import { formatCount, shortDate } from "@/lib/format";

// Shared pieces of the admin tables: sortable headers, the filter bar and the
// "Showing 1–25 of 132" line. Everything is a link or a GET form, so views
// work without JavaScript and can be bookmarked.

/** A column header that sorts by this column; clicking again flips the order. */
export function SortHeader({ query, column, children }: { query: ActivityQuery; column: string; children: React.ReactNode }) {
  const active = query.sort === column;
  const dir = active ? (query.dir === "asc" ? "desc" : "asc") : column === "when" ? "desc" : "asc";
  const Icon = active ? (query.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
  return (
    <th scope="col" className="ae-label" aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}>
      <NextLink href={activityHref(query, { sort: column, dir })} scroll={false} className="ae-table__sort no-underline">
        {children}
        <Icon size={16} aria-hidden="true" className="ae-icon" />
      </NextLink>
    </th>
  );
}

export function PlainHeader({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="ae-label">
      {children}
    </th>
  );
}

export function When({ date }: { date: Date }) {
  return (
    <span className="flex flex-col">
      <span className="ae-body-sm whitespace-nowrap text-text">
        {shortDate(date)}, {date.toISOString().slice(11, 16)} UTC
      </span>
      <span className="ae-caption text-text-muted">
        <RelativeTime value={date} />
      </span>
    </span>
  );
}

type Option = { value: string; label: string };
const ANY = "any";
const withAny = (label: string, options: Option[]): Option[] => [{ value: ANY, label }, ...options];

/** One control per column, applied together. */
export function Filters({ query, entities, events, reasons }: { query: ActivityQuery; entities: string[]; events: Option[]; reasons: Option[] }) {
  const clear = activityHref({ ...query, q: "", entity: "", device: "", event: "", form: "", reason: "", status: "open", from: "", to: "" });
  const label = { signins: "Filter sign-ins", all: "Filter activity", reports: "Filter reports" }[query.tab];
  return (
    <form method="get" action="/admin/activity" role="search" aria-label={label} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      {query.tab !== "signins" && <input type="hidden" name="tab" value={query.tab} />}
      {query.sort !== "when" && <input type="hidden" name="sort" value={query.sort} />}
      {query.dir !== "desc" && <input type="hidden" name="dir" value={query.dir} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {query.tab === "signins" && (
          <>
            <TextField label="Member" name="q" size="sm" placeholder="Name or EXPA ID" defaultValue={query.q} />
            <Select label="Entity" name="entity" size="sm" defaultValue={query.entity || ANY} options={withAny("All entities", entities.map((entity) => ({ value: entity, label: entity })))} />
            <TextField label="Device" name="device" size="sm" placeholder="iPhone, Chrome…" defaultValue={query.device} />
          </>
        )}
        {query.tab === "all" && (
          <>
            <Select label="Event" name="event" size="sm" defaultValue={query.event || ANY} options={withAny("All events", events)} />
            <TextField label="By" name="q" size="sm" placeholder="Name or EXPA ID" defaultValue={query.q} />
            <TextField label="Form" name="form" size="sm" placeholder="Form title" defaultValue={query.form} />
          </>
        )}
        {query.tab === "reports" && (
          <>
            <TextField label="Form" name="form" size="sm" placeholder="Form title" defaultValue={query.form} />
            <Select label="Reason" name="reason" size="sm" defaultValue={query.reason || ANY} options={withAny("All reasons", reasons)} />
            <Select
              label="Status"
              name="status"
              size="sm"
              defaultValue={query.status}
              options={[
                { value: "open", label: "Open" },
                { value: "reviewed", label: "Reviewed" },
                { value: "all", label: "Open and reviewed" },
              ]}
            />
          </>
        )}
        <TextField label="From" name="from" type="date" size="sm" defaultValue={query.from} />
        <TextField label="To" name="to" type="date" size="sm" defaultValue={query.to} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {hasFilters(query) && (
          <NextLink href={clear} className="ae-link ae-body-sm">
            Clear filters
          </NextLink>
        )}
      </div>
    </form>
  );
}

/** "Showing 26–50 of 132 sign-ins". */
export function ResultCount({ first, last, total, noun }: { first: number; last: number; total: number; noun: string }) {
  return (
    <p className="ae-body-sm text-text-muted" aria-live="polite">
      {total === 0 ? `No ${noun}` : `Showing ${formatCount(first)}–${formatCount(last)} of ${formatCount(total)} ${noun}`}
    </p>
  );
}
