// Display formatting, identical on server and client (no locale surprises).

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11 Jan 2027", or "11 Jan" in the current year. */
export function shortDate(value: Date | string, now = new Date()): string {
  const date = new Date(value);
  const base = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "just now", "5 minutes ago", "yesterday", then a short date. */
export function relativeTime(value: Date | string, now = new Date()): string {
  const date = new Date(value);
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return shortDate(date, now);
}

/** "1,280" */
export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}
