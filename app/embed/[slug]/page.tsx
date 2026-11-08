import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { FormRenderer } from "@/components/form/FormRenderer";
import { db } from "@/lib/db";
import { availability } from "@/lib/forms/availability";
import { issueRenderToken } from "@/lib/forms/render-token";
import { turnstileSiteKey } from "@/lib/turnstile";
import { parseDocument } from "@/lib/forms/schema";
import { countView } from "@/lib/forms/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The form inside other websites (iframe). Framing is allowed only on this route. */
export default async function EmbedPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  const form = await db.form.findUnique({
    where: { slug },
    select: { id: true, published: true, publishedRevision: true, acceptingResponses: true, closesAt: true, responseLimit: true, responseCount: true, deletedAt: true },
  });
  const doc = form && !form.deletedAt && form.published ? parseDocument(form.published) : null;
  if (!form || !doc) notFound();

  const transparent = query.transparent === "1";
  const theme = query.theme === "light" || query.theme === "dark" ? query.theme : undefined;
  const open = availability(form);
  if (open.open) after(() => countView(form.id));

  return (
    <main className={transparent ? "fb-embed-transparent" : undefined}>
      <FormRenderer
        doc={doc}
        mode="embed"
        slug={slug}
        publishedRevision={form.publishedRevision ?? 0}
        renderToken={issueRenderToken(form.id)}
        turnstileSiteKey={turnstileSiteKey()}
        closedReason={open.open ? null : open.reason}
        transparent={transparent}
        themeOverride={theme}
      />
    </main>
  );
}
