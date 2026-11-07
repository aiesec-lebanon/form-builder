"use client";

import { relativeTime, shortDate } from "@/lib/format";

/** "3 hours ago" with the exact date on hover. Time moves, so hydration differences are expected. */
export function RelativeTime({ value, prefix }: { value: string | Date; prefix?: string }) {
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()} title={`${shortDate(date)} ${date.toTimeString().slice(0, 5)}`} suppressHydrationWarning>
      {prefix ? `${prefix} ` : ""}
      {relativeTime(date)}
    </time>
  );
}
