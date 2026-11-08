import { afterEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getSession: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: m.getCurrentUser, getSession: m.getSession }));

const { fetchEntities, GisError } = await import("@/lib/auth/gis");
const { importAiesecEntities } = await import("@/actions/entities");

type Call = [string, RequestInit];
function stubGis(...responses: Array<{ status?: number; body?: unknown } | Error>) {
  const mock = vi.fn(async () => {
    const next = responses.shift() ?? { body: { data: null } };
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
  });
  vi.stubGlobal("fetch", mock);
  return mock as unknown as { mock: { calls: Call[] } };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AIESEC entities", () => {
  it("reads the local committees of the owner's country, sorted and without duplicates", async () => {
    const fetchMock = stubGis({ body: { data: { currentPerson: { current_office: { parent: { suboffices: [{ id: 2, name: "Byblos" }, { id: 1, name: "Beirut" }, { id: 1, name: "Beirut" }, { id: 3, name: "" }] } } } } } });
    expect(await fetchEntities("member-token", "country")).toEqual([
      { id: "1", name: "Beirut" },
      { id: "2", name: "Byblos" },
    ]);
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("member-token");
  });

  it("falls back to other query shapes", async () => {
    stubGis({ body: { data: { currentPerson: { current_office: null } } } }, { body: { data: { currentPerson: { current_positions: [{ office: { parent: { suboffices: [{ id: "9", name: "Tyre" }] } } }, null] } } } });
    expect(await fetchEntities("t", "country")).toEqual([{ id: "9", name: "Tyre" }]);
    stubGis({ status: 500 }, { body: { data: { committee: { suboffices: [{ id: 5, name: "Lebanon", tag: "MC" }, { id: 6, name: "Region X", tag: "Region" }, { id: 7, name: "Jordan" }] } } } });
    expect(await fetchEntities("t", "countries")).toEqual([
      { id: "7", name: "Jordan" },
      { id: "5", name: "Lebanon" },
    ]);
    stubGis({ body: { data: { committees: { data: [{ id: 5, name: "Lebanon" }] } } } });
    expect(await fetchEntities("t", "countries")).toEqual([{ id: "5", name: "Lebanon" }]);
  });

  it("separates rejected sign-ins from empty answers and outages", async () => {
    stubGis({ status: 401 });
    await expect(fetchEntities("t", "country")).rejects.toMatchObject({ kind: "rejected" });
    stubGis({ body: { data: null } }, { body: { errors: [{ message: "unknown field" }] } });
    await expect(fetchEntities("t", "country")).rejects.toMatchObject({ kind: "unavailable" });
    stubGis(new TypeError("fetch failed"));
    await expect(fetchEntities("t", "countries")).rejects.toBeInstanceOf(GisError);
  });

  it("imports names for the builder with the member's own token", async () => {
    m.getCurrentUser.mockResolvedValue(null);
    m.getSession.mockResolvedValue(null);
    expect(await importAiesecEntities("country")).toMatchObject({ ok: false, error: expect.stringContaining("session") });
    m.getCurrentUser.mockResolvedValue({ id: "u1" });
    m.getSession.mockResolvedValue({ at: "member-token" });
    expect(await importAiesecEntities("planets" as never)).toMatchObject({ ok: false });
    stubGis({ body: { data: { currentPerson: { current_office: { parent: { suboffices: [{ id: 1, name: "Beirut" }] } } } } } });
    expect(await importAiesecEntities("country")).toEqual({ ok: true, data: { names: ["Beirut"] } });
    stubGis({ status: 403 });
    expect(await importAiesecEntities("country")).toMatchObject({ ok: false, error: expect.stringContaining("Reload") });
    stubGis({ body: { data: null } }, { body: { data: null } });
    expect(await importAiesecEntities("country")).toMatchObject({ ok: false, error: expect.stringContaining("type the options yourself") });
  });
});
