"use client";

import { Mail } from "lucide-react";
import * as React from "react";

import { Button, Modal, Spinner } from "@/components/aiesec";
import { AiesecLogo } from "@/components/brand/Logo";

// The public form's footer, after Google Forms': safety note, who made the
// content, contact, terms, privacy, report, and the AIESEC logo (never the
// "Powered by AIESEC" mark).

type Contact = { status: "loading" } | { status: "ready"; name: string; email: string | null } | { status: "error"; message: string };

const linkClass = "ae-link cursor-pointer border-0 bg-transparent p-0 whitespace-nowrap";

function Separator() {
  return (
    <span aria-hidden="true" className="mx-1.5">
      ·
    </span>
  );
}

export function FormFooter({ slug, formTitle }: { /** Absent in the builder's preview: contact and report are shown but inactive. */ slug?: string; formTitle: string }) {
  const [contact, setContact] = React.useState<Contact | null>(null);
  const [copied, setCopied] = React.useState(false);

  const openContact = async () => {
    setCopied(false);
    setContact({ status: "loading" });
    try {
      const response = await fetch(`/api/f/${slug}/contact`, { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { name?: string; email?: string | null; message?: string };
      setContact(
        response.ok && body.name ? { status: "ready", name: body.name, email: body.email ?? null } : { status: "error", message: body.message ?? "Couldn't load the owner's details. Try again." },
      );
    } catch {
      setContact({ status: "error", message: "Couldn't load the owner's details. Check your connection and try again." });
    }
  };

  const mailto = contact?.status === "ready" && contact.email ? `mailto:${contact.email}?subject=${encodeURIComponent(`About your form “${formTitle || "Untitled form"}”`)}` : null;

  return (
    <footer className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center ae-caption text-text-muted">
      <p className="m-0">Never submit passwords through AIESEC Forms.</p>
      <div className="flex flex-col gap-1">
        <p className="m-0">
          {slug ? (
            <button type="button" className={linkClass} onClick={openContact}>
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

      {slug && (
        <Modal
          open={contact !== null}
          onClose={() => setContact(null)}
          title="Contact form owner"
          size="sm"
          footer={
            <>
              <Button onClick={() => setContact(null)} data-autofocus={!mailto || undefined}>
                Close
              </Button>
              {mailto && (
                <Button as="a" href={mailto} variant="primary" iconStart={<Mail size={18} aria-hidden="true" />}>
                  Send email
                </Button>
              )}
            </>
          }
        >
          {contact?.status === "loading" && (
            <p className="flex items-center gap-2 ae-body text-text-muted">
              <Spinner size="sm" label="" /> Loading…
            </p>
          )}
          {contact?.status === "error" && <p className="ae-body text-danger-text">{contact.message}</p>}
          {contact?.status === "ready" && (
            <div className="flex flex-col gap-3 text-left">
              <p className="ae-body">
                <strong>{contact.name}</strong> made this form.
              </p>
              {contact.email ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="break-all ae-body text-text">{contact.email}</span>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(contact.email ?? "").then(
                        () => setCopied(true),
                        () => setCopied(false),
                      );
                    }}
                  >
                    {copied ? "Copied" : "Copy email"}
                  </Button>
                </div>
              ) : (
                <p className="ae-body text-text-muted">They haven&apos;t shared an email address.</p>
              )}
              <p className="ae-body-sm text-text-muted">Never send passwords or payment details by email.</p>
            </div>
          )}
        </Modal>
      )}
    </footer>
  );
}
