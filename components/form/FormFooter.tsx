"use client";

import * as React from "react";

import { AiesecLogo } from "@/components/brand/Logo";

import { ContactOwnerDialog, type Sender } from "./ContactOwner";

// The public form's footer, after Google Forms': safety note, contact, terms,
// privacy, report, and the AIESEC logo (never the "Powered by AIESEC" mark).

const linkClass = "ae-link cursor-pointer border-0 bg-transparent p-0 whitespace-nowrap";

function Separator() {
  return (
    <span aria-hidden="true" className="mx-1.5">
      ·
    </span>
  );
}

type Props = {
  /** Absent in the builder's preview: contact and report are shown but inactive. */
  slug?: string;
  /** Who's answering, when they signed in with AIESEC. */
  sender?: Sender | null;
  turnstileSiteKey?: string | null;
};

export function FormFooter({ slug, sender = null, turnstileSiteKey = null }: Props) {
  const [contactOpen, setContactOpen] = React.useState(false);

  return (
    <footer className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center ae-caption text-text-muted">
      <p className="m-0">Never submit passwords through AIESEC Forms.</p>
      <div className="flex flex-col gap-1">
        <p className="m-0">
          {slug ? (
            <button type="button" className={linkClass} onClick={() => setContactOpen(true)}>
              Contact form owner
            </button>
          ) : (
            <span className="whitespace-nowrap underline">Contact form owner</span>
          )}
          <Separator />
          <a href="/terms" target="_blank" rel="noopener" className="ae-link whitespace-nowrap">
            Terms of Service
          </a>
          <Separator />
          <a href="/privacy" target="_blank" rel="noopener" className="ae-link whitespace-nowrap">
            Privacy Policy
          </a>
        </p>
      </div>
      <p className="m-0">
        Does this form look suspicious?{" "}
        {slug ? (
          <a href={`/f/${slug}/report`} target="_blank" rel="noopener" className="ae-link">
            Report
          </a>
        ) : (
          <span className="underline">Report</span>
        )}
      </p>
      <a href="/" target="_blank" rel="noopener" aria-label="AIESEC Forms" className="mt-2 no-underline opacity-90 hover:opacity-100">
        <AiesecLogo height={18} />
      </a>

      {slug && <ContactOwnerDialog slug={slug} open={contactOpen} onClose={() => setContactOpen(false)} sender={sender} turnstileSiteKey={turnstileSiteKey} />}
    </footer>
  );
}
