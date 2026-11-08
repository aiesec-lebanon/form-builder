"use client";

import * as React from "react";

import { Button, Tag, TextField } from "@/components/aiesec";
import { setEmbedDomains } from "@/actions/publish";
import { MAX_EMBED_DOMAINS, parseEmbedDomains } from "@/lib/forms/embed-domains";

// Which websites may show the form in an iframe (ADR-011). Empty = any site.
// Every change saves at once; browsers enforce it through the CSP the proxy sends.

type Props = {
  formId: string;
  domains: string[];
  onChange: (domains: string[]) => void;
};

export function EmbedSites({ formId, domains, onChange }: Props) {
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const full = domains.length >= MAX_EMBED_DOMAINS;

  const save = (next: string[], after?: () => void) =>
    startTransition(async () => {
      const result = await setEmbedDomains(formId, next);
      if (!result.ok) return setError(result.error);
      setError(null);
      onChange(result.data.embedDomains);
      after?.();
    });

  const add = () => {
    // Several sites can be pasted at once, separated by spaces, commas or lines.
    const entries = draft.split(/[\s,]+/).filter(Boolean);
    if (entries.length === 0) return;
    const parsed = parseEmbedDomains([...domains, ...entries]);
    if (!parsed.ok) return setError(parsed.error);
    save(parsed.domains, () => setDraft(""));
  };

  return (
    <fieldset className="ae-fieldset flex flex-col gap-3">
      <legend className="ae-fieldset__legend ae-label">Allowed websites</legend>
      <p className="ae-field__hint ae-body-sm">
        {domains.length > 0 ? "Only these websites can show the form. The link itself still works anywhere." : "Any website can show this form. Add your own sites to allow only those."}
      </p>
      {domains.length > 0 && (
        <ul role="list" aria-label="Allowed websites" className="flex flex-wrap gap-2">
          {domains.map((domain) => (
            <li key={domain}>
              <Tag disabled={pending} onRemove={() => save(domains.filter((item) => item !== domain))} removeLabel={`Remove ${domain}`}>
                {domain}
              </Tag>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <TextField
          label="Website to allow"
          hideLabel
          placeholder={full ? `Up to ${MAX_EMBED_DOMAINS} websites` : "aiesec.org"}
          value={draft}
          disabled={full}
          error={error ?? undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
          className="min-w-0 flex-1"
        />
        <Button onClick={add} loading={pending} disabled={full || !draft.trim()}>
          Allow
        </Button>
      </div>
      <p className="ae-caption text-text-muted">Use *.aiesec.org for its subdomains, and list aiesec.org too for the main site. Changes apply within a minute.</p>
    </fieldset>
  );
}
