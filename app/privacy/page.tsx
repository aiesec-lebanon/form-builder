import type { Metadata } from "next";

import { PublicPage } from "@/components/app/PublicPage";

export const metadata: Metadata = { title: "Privacy" };

const UPDATED = "9 November 2026";

export default function PrivacyPage() {
  return (
    <PublicPage>
      <article className="flex flex-col gap-8">
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
          <ul className="m-0 flex list-disc flex-col gap-2 pl-6 ae-body">
            <li>For members who sign in: name, EXPA ID, EXPA sign-in email and AIESEC email, profile photo, entity and position from EXPA, and when they last signed in.</li>
            <li>Form definitions: questions, settings, and who can edit each form.</li>
            <li>Destination settings. Passwords, keys and tokens are encrypted.</li>
            <li>How many responses a form received and whether deliveries are working, never the answers.</li>
            <li>An activity log of sign-ins and changes, with the browser name and a one-way hash of the IP address.</li>
            <li>Messages sent with &ldquo;Contact form owner&rdquo; (deleted after a year) and reports about forms.</li>
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
            When a form owner connects Google, AIESEC Forms asks only for permission to work with files it creates or that the owner picks in Google&apos;s file chooser (the <code className="ae-code">drive.file</code> scope). It keeps its files in an &ldquo;AIESEC Forms&rdquo; folder, creates response Sheets and upload folders there (or adds a tab to a Sheet the owner picked), adds rows, receives and names uploads, and cannot see anything else in the owner&apos;s Drive. Owners can disconnect at any time in Settings or in their Google account.
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
          <h2 className="ae-h3">Contacting a form&apos;s owner and reporting a form</h2>
          <p className="ae-body">
            &ldquo;Contact form owner&rdquo; sends the form&apos;s owner and editors your subject and message, with the name and email you enter so they can reply. The owner&apos;s own email isn&apos;t shown. We keep messages for the form&apos;s team for up to a year, or until they delete them. &ldquo;Report&rdquo; sends us the reason you choose, any details you add and, if you give it, your email so we can follow up. Both keep a one-way hash of your IP address to stop abuse. The platform team uses reports only to review the form.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="ae-h3">Contact</h2>
          <p className="ae-body">AIESEC Forms is run by AIESEC in Lebanon. Questions about this policy go to the platform team of AIESEC in Lebanon.</p>
        </section>
      </article>
    </PublicPage>
  );
}
