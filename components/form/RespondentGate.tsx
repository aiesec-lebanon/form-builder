import { ArrowUpRight, CircleCheck, LogIn, ShieldAlert } from "lucide-react";

import type { AccessProblem } from "@/lib/forms/respondents";
import type { FormDocument } from "@/lib/forms/schema";
import { formThemeAttribute } from "@/lib/forms/theme";

import { FormFooter } from "./FormFooter";
import { NotYou } from "./NotYou";

// What people see instead of an AIESEC-only form when they can't answer yet
// (ADR-013). Server-rendered: plain links and a form post, no client code.

export type GateReason = AccessProblem | "embed";

const SIGN_IN_ERRORS: Record<string, string> = {
  denied: "Sign-in was cancelled. Try again when you're ready.",
  aiesec_unavailable: "AIESEC sign-in isn't responding right now. Try again in a minute.",
};

type Props = {
  doc: FormDocument;
  slug: string;
  reason: GateReason;
  respondent?: { name: string; canSwitch: boolean } | null;
  signInError?: string | null;
  turnstileSiteKey?: string | null;
};

export function RespondentGate({ doc, slug, reason, respondent, signInError, turnstileSiteKey = null }: Props) {
  const formPath = `/f/${slug}`;
  const signInHref = `/api/auth/login?purpose=respond&returnTo=${encodeURIComponent(formPath)}`;
  const recorded = doc.settings.access.recordRespondent;

  let icon = <LogIn size={28} aria-hidden="true" />;
  let heading = "Sign in with AIESEC to answer";
  let body: React.ReactNode = (
    <p className="ae-body text-text-muted">
      This form is for people with an AIESEC account. You&apos;ll come straight back here after signing in.
      {recorded && " The form's owner will see your name, email and AIESEC ID with your answers."}
    </p>
  );
  let action: React.ReactNode = (
    <a href={signInHref} className="ae-btn ae-btn--primary ae-btn--lg ae-body no-underline">
      Sign in with AIESEC
    </a>
  );

  if (reason === "members_only") {
    icon = <ShieldAlert size={28} aria-hidden="true" />;
    heading = "This form is for current AIESEC members";
    body = (
      <p className="ae-body text-text-muted">
        {respondent ? `You're signed in as ${respondent.name}, but` : "Your account"} EXPA doesn&apos;t show a current role for you. If that&apos;s wrong, update your role in EXPA and try again later.
      </p>
    );
    action = respondent?.canSwitch ? <NotYou slug={slug} /> : null;
  } else if (reason === "already_responded") {
    icon = <CircleCheck size={28} aria-hidden="true" />;
    heading = "You've already responded";
    body = <p className="ae-body text-text-muted">{respondent ? `Thanks, ${respondent.name}. ` : ""}This form takes one response per person.</p>;
    action = respondent?.canSwitch ? <NotYou slug={slug} /> : null;
  } else if (reason === "embed") {
    heading = "Sign in to answer";
    body = <p className="ae-body text-text-muted">This form asks you to sign in with AIESEC, which works in a new tab.</p>;
    action = (
      <a href={formPath} target="_blank" rel="noopener" className="ae-btn ae-btn--primary ae-btn--lg ae-body no-underline">
        Open the form
        <ArrowUpRight size={18} aria-hidden="true" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }

  const error = reason === "sign_in" && signInError ? (SIGN_IN_ERRORS[signInError] ?? "Sign-in didn't finish. Try again.") : null;

  return (
    <div data-program={doc.theme.accent} data-theme={formThemeAttribute(doc.theme.style, doc.theme.mode)} className="fb-form min-h-dvh bg-bg text-text">
      <div aria-hidden="true" className="h-1.5 w-full bg-accent" />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <p className="ae-label text-text-muted">{doc.title || "Form"}</p>
        <section className="flex flex-col items-start gap-4">
          <span className="inline-flex size-14 items-center justify-center rounded-full bg-fill text-text">{icon}</span>
          <h1 className="ae-h2">{heading}</h1>
          {body}
          {error && (
            <p role="alert" className="ae-field__error ae-body-sm">
              {error}
            </p>
          )}
          {action}
        </section>
        <FormFooter slug={slug} turnstileSiteKey={turnstileSiteKey} />
      </div>
    </div>
  );
}
