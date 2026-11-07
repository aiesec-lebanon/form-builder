import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeliveryContext, DestinationAdapter, LoadedDestination } from "@/lib/destinations/types";

const state = vi.hoisted(() => ({
  destinations: [] as LoadedDestination[],
  health: [] as Array<{ id: string; ok: boolean }>,
  adapters: {} as Record<string, DestinationAdapter>,
}));

vi.mock("@/lib/destinations/store", () => ({
  loadDestinations: vi.fn(async () => state.destinations),
  recordHealth: vi.fn(async (id: string, result: { ok: boolean }) => {
    state.health.push({ id, ok: result.ok });
  }),
}));

vi.mock("@/lib/destinations/registry", () => ({
  adapterFor: (type: string) => state.adapters[type],
}));

const { deliverToPrimary, deliverToSecondaries } = await import("@/lib/destinations/deliver");

function destination(id: string, role: LoadedDestination["role"], type: LoadedDestination["type"] = "webhook"): LoadedDestination {
  return { id, formId: "form-1", type, role, name: id, config: {}, secrets: {}, googleConnectionId: null };
}

const context = { payload: { responseId: "r1" } } as unknown as DeliveryContext;

beforeEach(() => {
  state.destinations = [];
  state.health = [];
  state.adapters = {};
});

describe("delivery orchestration", () => {
  it("succeeds when the primary accepts, and hands back the secondaries", async () => {
    state.destinations = [destination("p", "primary"), destination("s", "secondary", "supabase")];
    state.adapters.webhook = { type: "webhook", test: vi.fn(), deliver: vi.fn(async () => ({ ok: true }) as const) };
    const outcome = await deliverToPrimary("form-1", context);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.secondaries.map((item) => item.id)).toEqual(["s"]);
    expect(state.health).toEqual([{ id: "p", ok: true }]);
  });

  it("fails the submission when the primary refuses, and records it", async () => {
    state.destinations = [destination("p", "primary")];
    state.adapters.webhook = { type: "webhook", test: vi.fn(), deliver: vi.fn(async () => ({ ok: false, retryable: true, message: "HTTP 503" }) as const) };
    const outcome = await deliverToPrimary("form-1", context);
    expect(outcome).toMatchObject({ ok: false, retryable: true });
    expect(state.health).toEqual([{ id: "p", ok: false }]);
  });

  it("turns adapter exceptions into a safe failure", async () => {
    state.destinations = [destination("p", "primary")];
    state.adapters.webhook = {
      type: "webhook",
      test: vi.fn(),
      deliver: vi.fn(async () => {
        throw Object.assign(new Error("timeout"), { name: "TimeoutError" });
      }),
    };
    const outcome = await deliverToPrimary("form-1", context);
    expect(outcome).toMatchObject({ ok: false, message: "The destination didn't respond within 10 seconds." });
  });

  it("refuses when no primary exists", async () => {
    state.destinations = [destination("s", "secondary")];
    expect(await deliverToPrimary("form-1", context)).toMatchObject({ ok: false, retryable: false });
  });

  it("delivers to every secondary even when one fails", async () => {
    const good = vi.fn(async () => ({ ok: true }) as const);
    state.adapters.webhook = { type: "webhook", test: vi.fn(), deliver: vi.fn(async () => ({ ok: false, retryable: false, message: "nope" }) as const) };
    state.adapters.supabase = { type: "supabase", test: vi.fn(), deliver: good };
    await deliverToSecondaries([destination("a", "secondary"), destination("b", "secondary", "supabase")], context);
    expect(good).toHaveBeenCalledTimes(1);
    expect(state.health).toEqual(expect.arrayContaining([{ id: "a", ok: false }, { id: "b", ok: true }]));
  });
});
