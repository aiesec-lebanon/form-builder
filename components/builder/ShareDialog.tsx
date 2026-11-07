"use client";

import { Download, ExternalLink } from "lucide-react";
import QRCode from "qrcode";
import * as React from "react";

import { Alert, Button, Switch, TextField, useToast } from "@/components/aiesec";
import { setAcceptingResponses, updateSlug } from "@/actions/publish";
import { CopyBlock } from "@/components/app/CopyBlock";

import { Sheet } from "./Sheet";

type Props = {
  open: boolean;
  onClose: () => void;
  formId: string;
  title: string;
  slug: string;
  onSlug: (slug: string) => void;
  published: boolean;
  acceptingResponses: boolean;
  onAccepting: (accepting: boolean) => void;
  publicBaseUrl: string;
  onPublish: () => void;
};

type Tab = "link" | "embed" | "qr";

export function ShareDialog(props: Props) {
  return (
    <Sheet open={props.open} onClose={props.onClose} title="Share your form" width={620}>
      {/* Mounted per opening, so edits in progress never linger. */}
      {props.open && <ShareBody {...props} />}
    </Sheet>
  );
}

function ShareBody({ formId, title, slug, onSlug, published, acceptingResponses, onAccepting, publicBaseUrl, onPublish }: Props) {
  const toast = useToast();
  const [tab, setTab] = React.useState<Tab>("link");
  const [editing, setEditing] = React.useState(false);
  const [draftSlug, setDraftSlug] = React.useState(slug);
  const [slugError, setSlugError] = React.useState<string | null>(null);
  const [qr, setQr] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const url = `${publicBaseUrl}/f/${slug}`;

  React.useEffect(() => {
    if (tab !== "qr") return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M", color: { dark: "#15171d", light: "#ffffff" } }).then(
      (data) => !cancelled && setQr(data),
      () => !cancelled && setQr(null),
    );
    return () => {
      cancelled = true;
    };
  }, [tab, url]);

  const saveSlug = () =>
    startTransition(async () => {
      const result = await updateSlug(formId, draftSlug);
      if (!result.ok) return setSlugError(result.fieldErrors?.slug ?? result.error);
      onSlug(result.data.slug);
      setEditing(false);
      setSlugError(null);
      toast.show({ title: "Link updated", description: "The old link no longer works." });
    });

  const toggleAccepting = (accepting: boolean) =>
    startTransition(async () => {
      const result = await setAcceptingResponses(formId, accepting);
      if (!result.ok) return void toast.show({ tone: "danger", title: "Couldn't change that", description: result.error });
      onAccepting(result.data.acceptingResponses);
      toast.show({ title: accepting ? "Form is open for responses" : "Form closed", description: accepting ? undefined : "People see a closed message instead." });
    });

  const embedScript = `<div data-aiesec-form="${slug}"></div>\n<script src="${publicBaseUrl}/embed.js" async></script>`;
  const embedIframe = `<iframe src="${publicBaseUrl}/embed/${slug}" title="${title.replace(/"/g, "&quot;")}" style="width:100%;height:720px;border:0" loading="lazy"></iframe>`;

  return (
    <>
      {!published ? (
        <div className="flex flex-col items-start gap-4">
          <p className="ae-body">Publish your form to get a link people can open.</p>
          <Button variant="primary" onClick={onPublish}>
            Publish now
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {!acceptingResponses && (
            <Alert tone="warning" title="This form is closed">
              People who open the link see that it isn&apos;t accepting responses.
            </Alert>
          )}
          <div role="tablist" aria-label="Share options" className="ae-tabs__list">
            {(["link", "embed", "qr"] as Tab[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className="ae-tab ae-label relative px-3 py-3">
                {item === "link" ? "Link" : item === "embed" ? "Embed" : "QR code"}
              </button>
            ))}
          </div>

          {tab === "link" && (
            <div className="flex flex-col gap-4">
              <CopyBlock label="Form link" value={url} wrap />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    void navigator.clipboard.writeText(url).then(() => toast.show({ title: "Link copied" }));
                  }}
                >
                  Copy link
                </Button>
                <a href={url} target="_blank" rel="noopener noreferrer" className="ae-btn ae-btn--secondary ae-body no-underline">
                  Open form
                  <ExternalLink size={16} aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
                {!editing && (
                  <Button variant="tertiary" onClick={() => setEditing(true)}>
                    Customise link
                  </Button>
                )}
              </div>
              {editing && (
                <div className="flex flex-col gap-3 rounded-md border border-border p-4">
                  <TextField
                    label="Link ending"
                    hint={`${publicBaseUrl}/f/…  Old links stop working when you change this.`}
                    value={draftSlug}
                    error={slugError ?? undefined}
                    onChange={(event) => setDraftSlug(event.target.value.toLowerCase())}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" loading={pending} onClick={saveSlug}>
                      Save link
                    </Button>
                    <Button size="sm" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "embed" && (
            <div className="flex flex-col gap-4">
              <p className="ae-body-sm text-text-muted">Paste this into your website. The form resizes itself to fit.</p>
              <CopyBlock label="Embed code" value={embedScript} />
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer ae-label">Use a plain iframe instead</summary>
                <div className="pt-3">
                  <CopyBlock label="Iframe code" value={embedIframe} />
                </div>
              </details>
            </div>
          )}

          {tab === "qr" && (
            <div className="flex flex-col items-center gap-4">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated data URL, not a remote image
                <img src={qr} alt={`QR code for ${url}`} width={240} height={240} className="rounded-md border border-border bg-white" />
              ) : (
                <div className="size-60 animate-pulse rounded-md bg-bg-subtle" aria-hidden="true" />
              )}
              <Button
                iconStart={<Download size={16} aria-hidden="true" />}
                disabled={!qr}
                onClick={() => {
                  if (!qr) return;
                  const link = document.createElement("a");
                  link.href = qr;
                  link.download = `${slug}-qr.png`;
                  link.click();
                }}
              >
                Download PNG
              </Button>
            </div>
          )}

          <div className="border-t border-border pt-4">
            <Switch label="Accepting responses" hint="Turn off to close the form without unpublishing it." checked={acceptingResponses} disabled={pending} onChange={(event) => toggleAccepting(event.target.checked)} />
          </div>
        </div>
      )}
    </>
  );
}
