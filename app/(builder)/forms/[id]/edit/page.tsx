import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Builder } from "@/components/builder/Builder";
import { CollaboratorsPanel } from "@/components/builder/CollaboratorsPanel";
import { loadCollaboration } from "@/lib/forms/collaboration";
import type { BuilderTab } from "@/components/builder/TopBar";
import { getCurrentUser, requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { listSummaries } from "@/lib/destinations/store";
import { baseUrl, googleConfigured, googlePickerConfig } from "@/lib/env";
import { getFormAccess } from "@/lib/forms/access";
import { parseDocument } from "@/lib/forms/schema";
import { blankDocument } from "@/lib/forms/templates";
import { logger } from "@/lib/logger";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const TABS: BuilderTab[] = ["questions", "connect", "settings", "messages"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // Same access rule as the page: never reveal a title to someone who can't edit it.
  const user = await getCurrentUser();
  const access = user ? await getFormAccess(id, user.id, "edit") : null;
  return { title: access ? `Edit ${access.form.title}` : "Edit form" };
}

export default async function EditFormPage({ params, searchParams }: Props) {
  const { id } = await params;
  const user = await requireUser(`/forms/${id}/edit`);
  const access = await getFormAccess(id, user.id, "edit");
  if (!access) notFound();
  const { form } = access;

  let doc = parseDocument(form.draft);
  if (!doc) {
    logger.error("builder.unreadable_draft", { formId: id });
    doc = blankDocument(form.title);
  }

  const [destinations, googleAccounts, collaboration, messages] = await Promise.all([
    listSummaries(id),
    db.googleConnection.findMany({ where: { userId: user.id, status: "active" }, select: { id: true, email: true, rootFolderId: true }, orderBy: { createdAt: "asc" } }),
    loadCollaboration(id, user.id),
    db.formMessage.findMany({
      where: { formId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, senderName: true, senderEmail: true, subject: true, body: true, createdAt: true, readAt: true },
    }),
  ]);
  const tab = (await searchParams).tab;
  const initialTab = TABS.includes(tab as BuilderTab) ? (tab as BuilderTab) : "questions";

  return (
    <Builder
      form={{
        id: form.id,
        slug: form.slug,
        revision: form.revision,
        publishedRevision: form.publishedRevision,
        publishedAt: form.publishedAt?.toISOString() ?? null,
        acceptingResponses: form.acceptingResponses,
        embedDomains: form.embedDomains ?? [],
        closesAt: form.closesAt?.toISOString() ?? null,
        responseLimit: form.responseLimit,
        responseCount: form.responseCount,
        updatedAt: form.updatedAt.toISOString(),
        role: access.role,
      }}
      doc={doc}
      publicBaseUrl={baseUrl()}
      destinations={destinations}
      googleConfigured={googleConfigured()}
      googlePicker={Boolean(googlePickerConfig())}
      googleAccounts={googleAccounts}
      initialTab={initialTab}
      replyFrom={user.workEmail ?? user.email}
      messages={messages.map((message) => ({ ...message, createdAt: message.createdAt.toISOString(), readAt: message.readAt?.toISOString() ?? null }))}
      collaborators={collaboration ? <CollaboratorsPanel formId={form.id} initial={collaboration} /> : null}
    />
  );
}
