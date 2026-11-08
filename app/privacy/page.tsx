import type { Metadata } from "next";
import NextLink from "next/link";

import { AppMark } from "@/components/brand/Logo";

export const metadata: Metadata = { title: "Privacy" };

const UPDATED = "8 November 2026";

export default function PrivacyPage() {
  return (
    <main className="ae-container flex flex-col gap-10 py-8 lg:py-12">
      <NextLink href="/" aria-label="AIESEC Forms home" className="w-fit no-underline">
        <AppMark />
      </NextLink>
      <article className="flex max-w-[68ch] flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="ae-h1">
            How AIESEC Forms <strong>handles data</strong>
          </h1>
          <p className="ae-body text-text-muted">Last updated {UPDATED}</p>
        </header>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">The short version</h2>
          <p className="ae-body-lg">
            Answers people give in a form go straight to the destination the form&apos;s owner chose: their Google Sheet, their webhook, or their own database. AIESEC Forms does not store response answers or uploaded files.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">What we keep</h2>
          <ul className="flex list-disc flex-col gap-2 pl-6 ae-body">
            <li>For members who sign in: name, EXPA ID, email, profile photo, entity and position from EXPA, and when they last signed in.</li>
            <li>Form definitions: questions, settings, and who can edit each form.</li>
            <li>Destination settings. Passwords, keys and tokens are encrypted.</li>
            <li>How many responses a form received and whether deliveries are working, never the answers.</li>
            <li>An activity log of sign-ins and changes, with the browser name and a one-way hash of the IP address.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Signing in with AIESEC</h2>
          <p className="ae-body">
            We use AIESEC&apos;s sign-in. Your AIESEC access token is kept in an encrypted cookie in your browser so your session stays active; we don&apos;t store it on our servers. Signing out deletes that cookie.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Google access</h2>
          <p className="ae-body">
            When a form owner connects Google, AIESEC Forms asks only for permission to work with files it creates (the <code className="ae-code">drive.file</code> scope). It creates a response Sheet and an uploads folder, adds rows and receives uploads there, and cannot see anything else in the owner&apos;s Drive. Owners can disconnect at any time in Settings or in their Google account.
          </p>
          <p className="ae-body">
            AIESEC Forms&apos; use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Filling in a form</h2>
          <p className="ae-body">
            While you fill in a form, your answers are saved in your own browser so you don&apos;t lose them. They&apos;re cleared once your response is sent. To stop spam, forms may use Cloudflare Turnstile, which checks that a person is sending the response. The form&apos;s owner decides what happens to your answers after that; contact them with any questions.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Forms that ask you to sign in with AIESEC</h2>
          <p className="ae-body">
            Some forms ask you to sign in with AIESEC before answering. AIESEC Forms then reads your name, email, AIESEC ID and whether you have a current role. It keeps them in an encrypted cookie in your browser for 12 hours and doesn&apos;t store them. The form tells you if its owner records who responded. In that case your name, email and AIESEC ID are sent with your answers to the owner&apos;s destination. Forms that take one response per person keep a one-way code showing that a response was sent, without your name or ID.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Contact</h2>
          <p className="ae-body">AIESEC Forms is run by AIESEC in Lebanon. Questions about this policy go to the platform team of AIESEC in Lebanon.</p>
        </section>
      </article>
    </main>
  );
}
