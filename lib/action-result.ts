// Return shape for Server Actions: expected failures are values, not throws.

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(error: string, extra?: { fieldErrors?: Record<string, string>; code?: string }): { ok: false; error: string; fieldErrors?: Record<string, string>; code?: string } {
  return { ok: false, error, ...extra };
}
