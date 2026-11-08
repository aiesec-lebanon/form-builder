import "server-only";

import { z } from "zod";

import { env } from "@/lib/env";

// Who signed in: GIS currentPerson, read with the user's OWN access token
// (auth-template). No developer-application/service token is ever used.

const QUERY = `query CurrentPerson {
  currentPerson {
    id
    full_name
    email
    aiesec_email
    profile_photo
    current_office { id name }
    current_positions { id title office { id name tag } role { id name } }
  }
}`;

const id = z.union([z.string(), z.number()]).transform(String);

const personSchema = z.object({
  id,
  full_name: z.string().nullish(),
  email: z.string().nullish(),
  /** The member's AIESEC work email (e.g. name@aiesec.net); "email" is the EXPA sign-in address. */
  aiesec_email: z.string().nullish(),
  profile_photo: z.string().nullish(),
  current_office: z.object({ id, name: z.string().nullish() }).nullish(),
  current_positions: z
    .array(
      z
        .object({
          id: id.nullish(),
          title: z.string().nullish(),
          office: z.object({ id, name: z.string().nullish(), tag: z.string().nullish() }).nullish(),
          role: z.object({ id: id.nullish(), name: z.string().nullish() }).nullish(),
        })
        .nullable(),
    )
    .nullish(),
});

export type GisPerson = z.infer<typeof personSchema>;

export class GisError extends Error {
  constructor(
    readonly kind: "unavailable" | "rejected",
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GisError";
  }
}

export async function fetchCurrentPerson(accessToken: string): Promise<GisPerson> {
  let response: Response;
  try {
    response = await fetch(env().GIS_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: accessToken },
      body: JSON.stringify({ query: QUERY }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new GisError("unavailable", "GIS unreachable", { cause: error });
  }
  if (response.status === 401 || response.status === 403) throw new GisError("rejected", `GIS responded ${response.status}`);
  if (!response.ok) throw new GisError("unavailable", `GIS responded ${response.status}`);

  const body = (await response.json().catch(() => null)) as { data?: { currentPerson?: unknown }; errors?: unknown } | null;
  const parsed = personSchema.safeParse(body?.data?.currentPerson);
  if (!parsed.success || !/^\d+$/.test(parsed.data.id)) {
    throw new GisError("unavailable", "GIS returned no usable currentPerson");
  }
  return parsed.data;
}

/** Positions with an office, the only ones that count for access. */
export function activePositions(person: GisPerson) {
  return (person.current_positions ?? []).filter((position): position is NonNullable<typeof position> => Boolean(position?.office?.id));
}

// --- AIESEC entities for dropdown options (ADR-015) ------------------------------
// Read with the owner's own token at build time. The GIS schema for committees
// can't be checked without a member token, so several known query shapes are
// tried in order and the answer is parsed defensively.

export type EntityScope = "country" | "countries";
export type Entity = { id: string; name: string };

const ENTITY_QUERIES: Record<EntityScope, Array<{ query: string; pick: (data: unknown) => unknown[] }>> = {
  country: [
    {
      query: `query CountryEntities { currentPerson { current_office { id name parent { id name suboffices { id name } } } } }`,
      pick: (data) => dig(data, ["currentPerson", "current_office", "parent", "suboffices"]) ?? [],
    },
    {
      query: `query CountryEntitiesFromPositions { currentPerson { current_positions { office { parent { suboffices { id name } } } } } }`,
      pick: (data) => (dig(data, ["currentPerson", "current_positions"]) ?? []).flatMap((position) => dig(position, ["office", "parent", "suboffices"]) ?? []),
    },
  ],
  countries: [
    {
      query: `query Countries { committees(filters: { tag: "MC" }, per_page: 500) { data { id name } } }`,
      pick: (data) => dig(data, ["committees", "data"]) ?? [],
    },
    {
      query: `query CountriesFromAi { committee(id: 1626) { suboffices { id name tag } } }`,
      pick: (data) => (dig(data, ["committee", "suboffices"]) ?? []).filter((office) => !(office as { tag?: string }).tag || (office as { tag?: string }).tag === "MC"),
    },
  ],
};

function dig(value: unknown, path: string[]): unknown[] | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return Array.isArray(current) ? current : null;
}

const entitySchema = z.object({ id, name: z.string().trim().min(1).max(200) });

async function gisQuery(accessToken: string, query: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(env().GIS_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: accessToken },
      body: JSON.stringify({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new GisError("unavailable", "GIS unreachable", { cause: error });
  }
  if (response.status === 401 || response.status === 403) throw new GisError("rejected", `GIS responded ${response.status}`);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { data?: unknown } | null;
  return body?.data ?? null;
}

/** Entities for the owner's country or for every country, sorted by name, without duplicates. */
export async function fetchEntities(accessToken: string, scope: EntityScope): Promise<Entity[]> {
  for (const attempt of ENTITY_QUERIES[scope]) {
    const data = await gisQuery(accessToken, attempt.query);
    const found = new Map<string, Entity>();
    for (const raw of attempt.pick(data)) {
      const parsed = entitySchema.safeParse(raw);
      if (parsed.success) found.set(parsed.data.id, parsed.data);
    }
    if (found.size > 0) return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  throw new GisError("unavailable", "GIS returned no entities");
}
