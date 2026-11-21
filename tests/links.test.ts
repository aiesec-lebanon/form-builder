import { describe, expect, it } from "vitest";

import { driveLinkProblem, parseDriveLink } from "@/lib/google/links";

const FOLDER = "1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVw";
const SHARED_DRIVE = "0AbCdEfGhIjKlUk9PVA";
const SHEET = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";

describe("pasted Drive links", () => {
  it("reads folder links from My Drive and shared drives", () => {
    expect(parseDriveLink(`https://drive.google.com/drive/folders/${FOLDER}`)).toEqual({ id: FOLDER, kind: "folder" });
    expect(parseDriveLink(`https://drive.google.com/drive/folders/${FOLDER}?usp=sharing`)).toEqual({ id: FOLDER, kind: "folder" });
    expect(parseDriveLink(`https://drive.google.com/drive/u/1/folders/${FOLDER}`)).toEqual({ id: FOLDER, kind: "folder" });
    expect(parseDriveLink(`https://drive.google.com/drive/mobile/folders/${FOLDER}/`)).toEqual({ id: FOLDER, kind: "folder" });
    // A shared drive's own page is a folder link too (its id starts with 0A).
    expect(parseDriveLink(`https://drive.google.com/drive/u/0/folders/${SHARED_DRIVE}`)).toEqual({ id: SHARED_DRIVE, kind: "folder" });
    expect(parseDriveLink(`https://drive.google.com/folderview?id=${FOLDER}`)).toEqual({ id: FOLDER, kind: "folder" });
    expect(parseDriveLink(`  drive.google.com/drive/folders/${FOLDER}  `)).toEqual({ id: FOLDER, kind: "folder" });
    expect(parseDriveLink(`https://drive.google.com/a/aiesec.net/drive/folders/${FOLDER}`)).toEqual({ id: FOLDER, kind: "folder" });
  });

  it("reads Sheet links, other files and bare ids", () => {
    expect(parseDriveLink(`https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`)).toEqual({ id: SHEET, kind: "spreadsheet" });
    expect(parseDriveLink(`https://docs.google.com/spreadsheets/u/2/d/${SHEET}/edit?usp=sharing`)).toEqual({ id: SHEET, kind: "spreadsheet" });
    expect(parseDriveLink(`https://docs.google.com/a/aiesec.net/spreadsheets/d/${SHEET}/edit`)).toEqual({ id: SHEET, kind: "spreadsheet" });
    expect(parseDriveLink(`https://docs.google.com/document/d/${SHEET}/edit`)).toEqual({ id: SHEET, kind: "file" });
    expect(parseDriveLink(`https://drive.google.com/file/d/${SHEET}/view`)).toEqual({ id: SHEET, kind: "file" });
    expect(parseDriveLink(`https://drive.google.com/open?id=${SHEET}`)).toEqual({ id: SHEET, kind: "unknown" });
    expect(parseDriveLink(SHEET)).toEqual({ id: SHEET, kind: "unknown" });
  });

  it("refuses anything else", () => {
    for (const input of [
      "",
      "   ",
      "not a link",
      `https://evil.example/drive/folders/${FOLDER}`,
      `https://drive.google.com.evil.example/drive/folders/${FOLDER}`,
      "https://drive.google.com/drive/my-drive",
      "https://drive.google.com/drive/shared-drives",
      "https://drive.google.com/drive/folders/short",
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ/pubhtml",
      `https://drive.google.com/drive/folders/${FOLDER}'%20or%20'1`,
      `https://drive.google.com/somewhere?id=${FOLDER}`,
      "https://",
    ]) {
      expect(parseDriveLink(input), input).toBeNull();
    }
  });

  it("says when a link can't be what's being chosen", () => {
    expect(driveLinkProblem({ id: FOLDER, kind: "folder" }, "folder")).toBeNull();
    expect(driveLinkProblem({ id: FOLDER, kind: "unknown" }, "folder")).toBeNull();
    expect(driveLinkProblem(null, "folder")).toContain("folder");
    expect(driveLinkProblem({ id: SHEET, kind: "spreadsheet" }, "folder")).toContain("Sheet");
    expect(driveLinkProblem({ id: SHEET, kind: "file" }, "folder")).toContain("file");
    expect(driveLinkProblem({ id: SHEET, kind: "spreadsheet" }, "spreadsheet")).toBeNull();
    expect(driveLinkProblem({ id: SHEET, kind: "unknown" }, "spreadsheet")).toBeNull();
    expect(driveLinkProblem(null, "spreadsheet")).toContain("Sheet");
    expect(driveLinkProblem({ id: FOLDER, kind: "folder" }, "spreadsheet")).toContain("folder");
    expect(driveLinkProblem({ id: SHEET, kind: "file" }, "spreadsheet")).toContain("isn't a Google Sheet");
  });
});
