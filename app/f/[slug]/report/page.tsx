import type { Metadata } from "next";
import NextLink from "next/link";
import { notFound } from "next/navigation";

import { AppMark } from "@/components/brand/Logo";
import { ReportForm } from "@/components/form/ReportForm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report a form", robots: { index: false, follow: false } };

type Props = { params: Promise<{ slug: string }> };

export default async function ReportFormPage({ params }: Props) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) notFound();
  const form = await db.form.findUnique({ where: { slug }, select: { title: true, published: true, deletedAt: true } });
  if (!form || form.deletedAt || !form.published) notFound();

  return (
    <main className="ae-container flex flex-col gap-10 py-8 lg:py-12">
      <NextLink href="/" aria-label="AIESEC Forms home" className="w-fit no-underline">
        <AppMark />
      </NextLink>
      <div className="flex max-w-[60ch] flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="ae-h2">Report a form</h1>
          <p className="ae-body text-text-muted">
            You&apos;re reporting <strong className="text-text">{form.title || "Untitled form"}</strong>. The platform team of AIESEC in Lebanon reviews every report. The form&apos;s owner isn&apos;t told who reported it.
          </p>
        </header>
        <ReportForm slug={slug} />
        <p className="ae-body-sm text-text-muted">
          <NextLink href={`/f/${slug}`} className="ae-link">
            Back to the form
          </NextLink>
        </p>
      </div>
    </main>
  );
}
