// Whether a published form takes responses right now. Isomorphic, so the
// public page, the submit route and the dashboard agree.

export type ClosedReason = "closed" | "expired" | "full";
export type Availability = { open: true } | { open: false; reason: ClosedReason };

export type AvailabilityInput = {
  acceptingResponses: boolean;
  closesAt: Date | string | null;
  responseLimit: number | null;
  responseCount: number;
};

export function availability(form: AvailabilityInput, now: Date = new Date()): Availability {
  if (!form.acceptingResponses) return { open: false, reason: "closed" };
  if (form.closesAt && new Date(form.closesAt).getTime() <= now.getTime()) return { open: false, reason: "expired" };
  if (form.responseLimit !== null && form.responseCount >= form.responseLimit) return { open: false, reason: "full" };
  return { open: true };
}
