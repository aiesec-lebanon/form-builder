import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { FormRenderer } from "@/components/form/FormRenderer";
import { db } from "@/lib/db";
import { availability } from "@/lib/forms/availability";
import { issueRenderToken } from "@/lib/forms/render-token";
import { parseDocument } from "@/lib/forms/schema";
import { countView } from "@/lib/forms/views";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const loadForm = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const form = await db.form.findUnique({
    where: { slug },
    select: { id: true, published: true, publishedRevision: true, acceptingResponses: true, closesAt: true, responseLimit: true, responseCount: true, deletedAt: true },
  });
  if (!form || form.deletedAt || !form.published) return null;
  const doc = parseDocument(form.published);
  return doc ? { ...form, doc } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const form = await loadForm((await params).slug);
  if (!form) return { title: "Form not found", robots: { index: false } };
  return {
    title: form.doc.title || "Form",
    description: form.doc.description.slice(0, 160) || "Fill in this form.",
    robots: { index: false, follow: false },
    openGraph: { title: form.doc.title || "Form", description: form.doc.description.slice(0, 160) || undefined },
  };
}

export default async function PublicFormPage({ params }: Props) {
  const { slug } = await params;
  const form = await loadForm(slug);
  if (!form) notFound();
  const open = availability(form);
  if (open.open) after(() => countView(form.id));
  return (
    <main className="flex min-h-dvh flex-col">
      <FormRenderer
        doc={form.doc}
        mode="live"
        slug={slug}
        publishedRevision={form.publishedRevision ?? 0}
        renderToken={issueRenderToken(form.id)}
        closedReason={open.open ? null : open.reason}
        fullHeight
      />
    </main>
  );
}
