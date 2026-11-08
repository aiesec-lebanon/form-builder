import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import NextLink from "next/link";

import { Button, DatePicker, Select } from "@/components/aiesec";
import { RelativeTime } from "@/components/app/RelativeTime";
import { activityHref, hasFilters, type ActivityQuery } from "@/lib/admin/activity-query";
import { formatCount, shortDate } from "@/lib/format";

import { FilterCombo, type FilterOption } from "./FilterCombo";

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

/** Values that exist in the data, per filter. */
export type FilterOptions = { people: FilterOption[]; entities: FilterOption[]; devices: FilterOption[]; events: FilterOption[]; forms: FilterOption[]; reasons: FilterOption[] };

/** One control per column, applied together. Lists offer only values that exist, and can be searched. */
export function Filters({ query, options }: { query: ActivityQuery; options: FilterOptions }) {
  const clear = activityHref({ ...query, person: "", entity: "", device: "", event: "", form: "", reason: "", status: "open", from: "", to: "" });
  const label = { signins: "Filter sign-ins", all: "Filter activity", reports: "Filter reports" }[query.tab];
  return (
    <form method="get" action="/admin/activity" role="search" aria-label={label} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      {query.tab !== "signins" && <input type="hidden" name="tab" value={query.tab} />}
      {query.sort !== "when" && <input type="hidden" name="sort" value={query.sort} />}
      {query.dir !== "desc" && <input type="hidden" name="dir" value={query.dir} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {query.tab === "signins" && (
          <>
            <FilterCombo label="Member" name="person" placeholder="Everyone" options={options.people} defaultValue={query.person} />
            <FilterCombo label="Entity" name="entity" placeholder="All entities" options={options.entities} defaultValue={query.entity} />
            <FilterCombo label="Device" name="device" placeholder="All devices" options={options.devices} defaultValue={query.device} />
          </>
        )}
        {query.tab === "all" && (
          <>
            <FilterCombo label="Event" name="event" placeholder="All events" options={options.events} defaultValue={query.event} />
            <FilterCombo label="By" name="person" placeholder="Everyone" options={options.people} defaultValue={query.person} />
            <FilterCombo label="Form" name="form" placeholder="All forms" options={options.forms} defaultValue={query.form} />
          </>
        )}
        {query.tab === "reports" && (
          <>
            <FilterCombo label="Form" name="form" placeholder="All forms" options={options.forms} defaultValue={query.form} />
            <FilterCombo label="Reason" name="reason" placeholder="All reasons" options={options.reasons} defaultValue={query.reason} />
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
        <DatePicker label="From" name="from" size="sm" defaultValue={query.from || undefined} />
        <DatePicker label="To" name="to" size="sm" defaultValue={query.to || undefined} />
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
