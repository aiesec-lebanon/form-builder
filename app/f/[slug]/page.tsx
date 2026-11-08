import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { FormRenderer } from "@/components/form/FormRenderer";
import { RespondentGate } from "@/components/form/RespondentGate";
import { db } from "@/lib/db";
import { availability } from "@/lib/forms/availability";
import { issueRenderToken } from "@/lib/forms/render-token";
import { turnstileSiteKey } from "@/lib/turnstile";
import { accessProblem, currentRespondent, hasResponded } from "@/lib/forms/respondents";
import { parseDocument } from "@/lib/forms/schema";
import { countView } from "@/lib/forms/views";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

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

export default async function PublicFormPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const form = await loadForm(slug);
  if (!form) notFound();
  const open = availability(form);
  if (open.open) after(() => countView(form.id));

  // AIESEC-only forms (ADR-013): sign in first; members only and one response per person if the owner chose so.
  const access = form.doc.settings.access;
  const respondent = access.mode === "aiesec" && open.open ? await currentRespondent() : null;
  if (access.mode === "aiesec" && open.open) {
    const already = respondent && access.onePerPerson ? await hasResponded(form.id, respondent.aiesecId) : false;
    const problem = accessProblem(access, respondent, already);
    if (problem) {
      const signin = (await searchParams).signin;
      return (
        <main className="flex min-h-dvh flex-col">
          <RespondentGate
            doc={form.doc}
            slug={slug}
            reason={problem}
            respondent={respondent ? { name: respondent.name, canSwitch: respondent.source === "respondent" } : null}
            signInError={typeof signin === "string" ? signin : null}
          />
        </main>
      );
    }
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <FormRenderer
        doc={form.doc}
        mode="live"
        slug={slug}
        publishedRevision={form.publishedRevision ?? 0}
        renderToken={issueRenderToken(form.id)}
        turnstileSiteKey={turnstileSiteKey()}
        closedReason={open.open ? null : open.reason}
        respondent={respondent ? { name: respondent.name, email: respondent.email, canSwitch: respondent.source === "respondent", recorded: access.recordRespondent } : null}
        fullHeight
      />
    </main>
  );
}
