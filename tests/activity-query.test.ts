import { describe, expect, it } from "vitest";

import { activityHref, auditOrderBy, auditWhere, createdAtRange, hasFilters, PAGE_SIZE, pageWindow, parseActivityQuery, reportOrderBy, reportWhere } from "@/lib/admin/activity-query";

describe("admin activity URLs", () => {
  it("reads filters, sort and page safely", () => {
    const query = parseActivityQuery({ tab: "reports", sort: "form", dir: "asc", page: "3", form: " Recruitment ", reason: "spam", status: "all", from: "2026-11-01", to: "not-a-date" });
    expect(query).toMatchObject({ tab: "reports", sort: "form", dir: "asc", page: 3, form: "Recruitment", reason: "spam", status: "all", from: "2026-11-01", to: "" });
    expect(parseActivityQuery({ tab: "nope", sort: "reason", page: "-4", entity: "any", from: "2026-02-31" })).toMatchObject({ tab: "signins", sort: "when", dir: "desc", page: 1, entity: "" });
    expect(parseActivityQuery({ page: "999999" }).page).toBe(10_000);
  });

  it("builds links that keep the view and reset the page", () => {
    const query = parseActivityQuery({ tab: "all", q: "Lina", event: "form.published", sort: "by", dir: "asc", page: "4", entity: "LC Beirut" });
    expect(activityHref(query)).toBe("/admin/activity?tab=all&q=Lina&event=form.published&sort=by&dir=asc");
    expect(activityHref(query, { page: 2 })).toBe("/admin/activity?tab=all&q=Lina&event=form.published&sort=by&dir=asc&page=2");
    expect(activityHref(parseActivityQuery({}), { tab: "reports", status: "reviewed", from: "2026-11-01" })).toBe("/admin/activity?tab=reports&status=reviewed&from=2026-11-01");
    expect(activityHref(parseActivityQuery({}))).toBe("/admin/activity");
  });

  it("knows when filters are set", () => {
    expect(hasFilters(parseActivityQuery({}))).toBe(false);
    expect(hasFilters(parseActivityQuery({ sort: "member", page: "2" }))).toBe(false);
    expect(hasFilters(parseActivityQuery({ device: "iPhone" }))).toBe(true);
    expect(hasFilters(parseActivityQuery({ tab: "all", form: "x" }))).toBe(true);
    expect(hasFilters(parseActivityQuery({ tab: "reports" }))).toBe(false);
    expect(hasFilters(parseActivityQuery({ tab: "reports", status: "all" }))).toBe(true);
    expect(hasFilters(parseActivityQuery({ to: "2026-11-09" }))).toBe(true);
  });
});

describe("admin activity queries", () => {
  it("filters sign-ins by member, entity, device and day", () => {
    const where = auditWhere(parseActivityQuery({ q: "5099966", entity: "LC Beirut", device: "iPhone", from: "2026-11-01", to: "2026-11-01" }));
    expect(where).toMatchObject({
      type: "auth.sign_in",
      userAgent: { contains: "iPhone", mode: "insensitive" },
      actor: { officeName: "LC Beirut", OR: [{ fullName: { contains: "5099966", mode: "insensitive" } }, { aiesecPersonId: 5099966n }] },
      createdAt: { gte: new Date("2026-11-01T00:00:00Z"), lt: new Date("2026-11-02T00:00:00Z") },
    });
    expect(auditWhere(parseActivityQuery({ q: "Lina" })).actor).toEqual({ fullName: { contains: "Lina", mode: "insensitive" } });
  });

  it("filters all activity by event, person and form", () => {
    expect(auditWhere(parseActivityQuery({ tab: "all", event: "form.published", form: "Recruitment" }), ["f1", "f2"])).toEqual({ type: "form.published", targetType: "form", targetId: { in: ["f1", "f2"] } });
    expect(auditWhere(parseActivityQuery({ tab: "all", form: "x" }))).toMatchObject({ targetId: { in: [] } });
    expect(auditWhere(parseActivityQuery({ tab: "all" }))).toEqual({});
  });

  it("sorts by the chosen column, newest first by default", () => {
    expect(auditOrderBy(parseActivityQuery({}))).toEqual([{ id: "desc" }]);
    expect(auditOrderBy(parseActivityQuery({ sort: "member", dir: "asc" }))).toEqual([{ actor: { fullName: "asc" } }, { id: "desc" }]);
    expect(auditOrderBy(parseActivityQuery({ sort: "entity" }))).toEqual([{ actor: { officeName: { sort: "desc", nulls: "last" } } }, { id: "desc" }]);
    expect(auditOrderBy(parseActivityQuery({ tab: "all", sort: "event", dir: "asc" }))).toEqual([{ type: "asc" }, { id: "desc" }]);
    expect(reportOrderBy(parseActivityQuery({ tab: "reports" }))).toEqual([{ createdAt: "desc" }]);
    expect(reportOrderBy(parseActivityQuery({ tab: "reports", sort: "form", dir: "asc" }))).toEqual([{ form: { title: "asc" } }, { createdAt: "desc" }]);
    expect(reportOrderBy(parseActivityQuery({ tab: "reports", sort: "reason" }))).toEqual([{ reason: "desc" }, { createdAt: "desc" }]);
  });

  it("filters reports by status, reason, form and day", () => {
    expect(reportWhere(parseActivityQuery({ tab: "reports" }))).toEqual({ reviewedAt: null });
    expect(reportWhere(parseActivityQuery({ tab: "reports", status: "reviewed", reason: "spam", form: "Rec", from: "2026-11-05" }))).toEqual({
      reviewedAt: { not: null },
      reason: "spam",
      form: { title: { contains: "Rec", mode: "insensitive" } },
      createdAt: { gte: new Date("2026-11-05T00:00:00Z") },
    });
    expect(reportWhere(parseActivityQuery({ tab: "reports", status: "all" }))).toEqual({});
    expect(createdAtRange({ from: "", to: "" })).toBeUndefined();
  });

  it("pages through results", () => {
    expect(pageWindow(1, 0)).toEqual({ page: 1, pageCount: 1, skip: 0, first: 0, last: 0 });
    expect(pageWindow(2, 60)).toEqual({ page: 2, pageCount: 3, skip: PAGE_SIZE, first: PAGE_SIZE + 1, last: PAGE_SIZE * 2 });
    expect(pageWindow(9, 60)).toMatchObject({ page: 3, first: 51, last: 60 });
  });
});
