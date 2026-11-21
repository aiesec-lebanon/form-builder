// Links people paste for a Drive folder or a Google Sheet, from My Drive or a
// shared drive. Pure, so the browser can answer instantly and the server can
// check again: this only reads the file id out of the link. What the id really
// is, and whether the account can use it, is checked with Google on the server.

/** Drive file ids, shared-drive ids included: letters, digits, "-" and "_". */
export const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** What the link's shape says it points to. "unknown": a bare id or an open?id= link. */
export type DriveLinkKind = "folder" | "spreadsheet" | "file" | "unknown";
export type DriveLink = { id: string; kind: DriveLinkKind };
export type WantedKind = "folder" | "spreadsheet";

/** A folder or Sheet the server checked: the account can save there. */
export type DriveLocation = { id: string; name: string; url: string; sharedDrive: boolean };

const HOSTS = new Set(["drive.google.com", "docs.google.com"]);
/** Optional "/u/1" (signed into several accounts) after a path segment. */
const USER = String.raw`(?:u\/\d+\/)?`;

const PATTERNS: Array<{ kind: DriveLinkKind; host: string; path: RegExp }> = [
  // drive.google.com/drive/folders/<id>, also /drive/u/1/folders/<id> and the mobile site. Shared drives (and their root) look the same.
  { kind: "folder", host: "drive.google.com", path: new RegExp(String.raw`^\/drive\/${USER}(?:mobile\/)?folders\/([^/]+)`) },
  { kind: "file", host: "drive.google.com", path: new RegExp(String.raw`^\/file\/${USER}d\/([^/]+)`) },
  { kind: "spreadsheet", host: "docs.google.com", path: new RegExp(String.raw`^\/spreadsheets\/${USER}d\/([^/]+)`) },
  { kind: "file", host: "docs.google.com", path: new RegExp(String.raw`^\/(?:document|presentation|forms|drawings)\/${USER}d\/([^/]+)`) },
];

/** The file id in a Drive or Sheets link (or a bare id), or null when it isn't one. */
export function parseDriveLink(input: string): DriveLink | null {
  const text = input.trim();
  if (!text) return null;
  if (DRIVE_FILE_ID.test(text)) return { id: text, kind: "unknown" };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;
  // Older Workspace links put the domain first: /a/aiesec.net/spreadsheets/d/<id>.
  const path = url.pathname.replace(/^\/a\/[^/]+(?=\/)/, "");
  for (const pattern of PATTERNS) {
    const match = pattern.host === host ? pattern.path.exec(path) : null;
    if (match) return DRIVE_FILE_ID.test(match[1]) ? { id: match[1], kind: pattern.kind } : null;
  }
  // drive.google.com/open?id=<id> and /folderview?id=<id>
  const id = url.searchParams.get("id");
  if (host === "drive.google.com" && id && DRIVE_FILE_ID.test(id)) {
    if (path === "/folderview") return { id, kind: "folder" };
    if (path === "/open") return { id, kind: "unknown" };
  }
  return null;
}

/** What to tell people when the link can't be what they're choosing; null when it might be. */
export function driveLinkProblem(link: DriveLink | null, want: WantedKind): string | null {
  if (want === "folder") {
    if (!link) return "Paste the link of a Google Drive folder. Open the folder in Drive and copy the address from your browser.";
    if (link.kind === "spreadsheet") return "That's a link to a Sheet. Paste the link of a folder instead.";
    if (link.kind === "file") return "That's a link to a file. Paste the link of a folder instead.";
    return null;
  }
  if (!link) return "Paste the link of a Google Sheet. Open the Sheet and copy the address from your browser.";
  if (link.kind === "folder") return "That's a link to a folder. Paste the link of a Sheet instead.";
  if (link.kind === "file") return "That isn't a Google Sheet. Paste the link of a Sheet instead.";
  return null;
}
