import type { Metadata } from "next";
import NextLink from "next/link";

import { PublicPage } from "@/components/app/PublicPage";

export const metadata: Metadata = { title: "Terms of Service" };

const UPDATED = "9 November 2026";

export default function TermsPage() {
  return (
    <PublicPage>
      <article className="flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="ae-h1">
            Terms of <strong>Service</strong>
          </h1>
          <p className="ae-body text-text-muted">Last updated {UPDATED}</p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">The short version</h2>
          <p className="ae-body-lg">
            AIESEC Forms lets AIESEC members build forms and send the answers to places they choose. Each form belongs to the member who made it, and they are responsible for what it asks and what they do with the answers.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">If you fill in a form</h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-6 ae-body">
            <li>Your answers go to the form&apos;s owner, not to AIESEC Forms. Questions about how they&apos;re used go to the owner (use &ldquo;Contact form owner&rdquo; at the bottom of the form).</li>
            <li>Never send passwords, bank or card details through a form.</li>
            <li>If a form looks suspicious, use &ldquo;Report&rdquo; at the bottom of the form.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">If you make a form</h2>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-6 ae-body">
            <li>Use AIESEC Forms for AIESEC work, and follow AIESEC&apos;s policies and the law, including data protection rules.</li>
            <li>Tell people what you collect and why, and only ask for what you need.</li>
            <li>Don&apos;t ask for passwords, don&apos;t pretend to be someone else, and don&apos;t use forms for spam, harassment or anything harmful or illegal.</li>
            <li>You&apos;re responsible for the destinations you connect (Google Sheets, Drive, webhooks, databases) and for keeping the answers there safe.</li>
            <li>People who fill in your form can see your name and email through &ldquo;Contact form owner&rdquo;.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Reports and removal</h2>
          <p className="ae-body">
            The platform team of AIESEC in Lebanon reviews reported forms. We may stop a form from taking responses, or remove access, when it breaks these terms or puts people at risk.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">The service</h2>
          <p className="ae-body">
            We work to keep AIESEC Forms available and to deliver every response, but we can&apos;t promise it will always be available or free of errors. Responses are delivered to the destinations the owner chose and are not stored by AIESEC Forms, so we can&apos;t recover answers a destination didn&apos;t receive. We may change these terms; the date above shows the latest version.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Privacy and contact</h2>
          <p className="ae-body">
            How data is handled is described in the{" "}
            <NextLink href="/privacy" className="ae-link">
              Privacy Policy
            </NextLink>
            . AIESEC Forms is run by AIESEC in Lebanon. Questions about these terms go to the platform team of AIESEC in Lebanon.
          </p>
        </section>
      </article>
    </PublicPage>
  );
}
