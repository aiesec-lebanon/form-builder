import type { Metadata } from "next";

import { formStatus } from "@/components/app/StatusBadge";
import { FormsDashboard, type DashboardForm } from "@/components/dashboard/FormsDashboard";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { baseUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Your forms" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FormsPage({ searchParams }: Props) {
  const user = await requireUser("/forms");
  const view = (await searchParams).view === "trash" ? "trash" : "active";

  const forms = await db.form.findMany({
    where:
      view === "trash"
        ? { ownerId: user.id, deletedAt: { not: null } }
        : { deletedAt: null, OR: [{ ownerId: user.id }, { collaborators: { some: { userId: user.id } } }] },
    orderBy: { updatedAt: "desc" },
    take: 300,
    select: {
      id: true,
      title: true,
      slug: true,
      publishedAt: true,
      acceptingResponses: true,
      responseCount: true,
      updatedAt: true,
      deletedAt: true,
      ownerId: true,
      owner: { select: { fullName: true } },
      destinations: { where: { role: "primary" }, select: { consecutiveFailures: true } },
    },
  });

  const items: DashboardForm[] = forms.map((form) => ({
    id: form.id,
    title: form.title || "Untitled form",
    slug: form.slug,
    status: formStatus(form),
    responseCount: form.responseCount,
    updatedAt: form.updatedAt.toISOString(),
    deletedAt: form.deletedAt?.toISOString() ?? null,
    isOwner: form.ownerId === user.id,
    ownerName: form.owner.fullName,
    failing: form.destinations.some((destination) => destination.consecutiveFailures > 0),
  }));

  return <FormsDashboard forms={items} view={view} publicBaseUrl={baseUrl()} firstName={user.fullName.split(" ")[0] ?? ""} />;
}
