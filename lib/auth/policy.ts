import { env } from "@/lib/env";

// Who may sign in, and who is a platform admin. Pure, so it is unit-tested.

export function isPlatformAdmin(personId: string | bigint | number, adminIds: string[] = env().PLATFORM_ADMIN_PERSON_IDS): boolean {
  return adminIds.includes(String(personId));
}

export type AccessDecision = { allowed: true } | { allowed: false; reason: "no_position" };

export function evaluateAccess(
  input: { personId: string; activePositionCount: number },
  options: { requireCurrentPosition: boolean; adminIds: string[] },
): AccessDecision {
  if (isPlatformAdmin(input.personId, options.adminIds)) return { allowed: true };
  if (options.requireCurrentPosition && input.activePositionCount === 0) return { allowed: false, reason: "no_position" };
  return { allowed: true };
}
