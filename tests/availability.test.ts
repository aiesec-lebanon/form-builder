import { describe, expect, it } from "vitest";

import { availability } from "@/lib/forms/availability";
import { completionRate } from "@/lib/forms/views";

const base = { acceptingResponses: true, closesAt: null, responseLimit: null, responseCount: 0 };
const now = new Date("2027-01-11T12:00:00Z");

describe("availability", () => {
  it("is open by default", () => {
    expect(availability(base, now)).toEqual({ open: true });
  });

  it("closes when switched off, past the close date, or at the limit", () => {
    expect(availability({ ...base, acceptingResponses: false }, now)).toEqual({ open: false, reason: "closed" });
    expect(availability({ ...base, closesAt: "2027-01-11T11:59:59Z" }, now)).toEqual({ open: false, reason: "expired" });
    expect(availability({ ...base, closesAt: "2027-01-11T12:00:01Z" }, now)).toEqual({ open: true });
    expect(availability({ ...base, responseLimit: 10, responseCount: 10 }, now)).toEqual({ open: false, reason: "full" });
    expect(availability({ ...base, responseLimit: 10, responseCount: 9 }, now)).toEqual({ open: true });
  });
});

describe("completionRate", () => {
  it("needs a few views before showing a rate", () => {
    expect(completionRate(1, 4)).toBeNull();
    expect(completionRate(31, 100)).toBe(31);
    expect(completionRate(12, 10)).toBe(100);
  });
});
