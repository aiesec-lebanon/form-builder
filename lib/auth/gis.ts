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
