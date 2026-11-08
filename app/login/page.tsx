import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AiesecHuman, Alert, Button, Link } from "@/components/aiesec";
import { SignedOutToast } from "@/components/app/SignedOutToast";
import { AppMark } from "@/components/brand/Logo";
import { getCurrentUser } from "@/lib/auth/current-user";
import { safeReturnTo } from "@/lib/auth/oauth";
import { devLoginEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, { title: string; body: string }> = {
  denied: { title: "Sign-in cancelled", body: "You cancelled the AIESEC sign-in. Try again when you're ready." },
  state: { title: "That sign-in link expired", body: "It may have been opened in another browser or tab. Start again from here." },
  missing_code: { title: "AIESEC couldn't finish signing you in", body: "Try again. If it keeps happening, sign out of AIESEC and back in." },
  exchange_failed: { title: "AIESEC couldn't finish signing you in", body: "Try again. If it keeps happening, sign out of AIESEC and back in." },
  aiesec_unavailable: { title: "AIESEC sign-in is unavailable", body: "AIESEC's sign-in service isn't responding. Try again in a few minutes." },
  server_error: { title: "Something went wrong on our side", body: "Your account is fine. Try signing in again." },
  session_expired: { title: "Your session ended", body: "Sign in again to pick up where you left off." },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : null);

  if (await getCurrentUser()) redirect(returnTo);

  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;
  const signedOut = params.signedOut === "1";
  const loginHref = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <main className="flex flex-col px-4 py-8 sm:px-8 lg:px-16">
        <AppMark />
        <div className="flex flex-1 items-center py-12">
          <div className="flex w-full max-w-md flex-col gap-6">
            <h1 className="ae-display">
              Build a form in <strong>a minute</strong>
            </h1>
            <p className="ae-body-lg text-text-muted">
              Sign in with your AIESEC account. Responses go straight to your Google Sheet, webhook or database. We never keep them.
            </p>
            {error && (
              <Alert tone="danger" title={error.title} live>
                {error.body}
              </Alert>
            )}
            {signedOut && !error && <SignedOutToast />}
            <div className="flex flex-col gap-3">
              <Button as="a" href={loginHref} variant="primary" size="lg" block>
                Continue with AIESEC
              </Button>
              {devLoginEnabled() && (
                <Button as="a" href={`/api/auth/dev-login?returnTo=${encodeURIComponent(returnTo)}`} variant="tertiary" block>
                  Use a development account
                </Button>
              )}
            </div>
            <p className="ae-body-sm text-text-muted">
              For AIESEC members with a current position in EXPA. <Link href="/privacy">How we handle data</Link>
            </p>
          </div>
        </div>
      </main>

      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-brand lg:flex lg:items-center lg:justify-center">
        <div className="absolute -right-24 -bottom-24 opacity-15">
          <AiesecHuman size={560} tone="white" />
        </div>
        <div className="relative flex w-full max-w-sm flex-col gap-6 p-8">
          <p className="ae-h2 text-on-brand">
            Your form. <br />
            Your data.
          </p>
          <div className="flex flex-col gap-4 rounded-lg bg-surface p-6 shadow-lg">
            <p className="ae-label text-text">Which programme interests you?</p>
            {["Global Volunteer", "Global Talent", "Global Teacher"].map((label, index) => (
              <div key={label} className="flex items-center gap-3">
                <span className={`inline-block size-5 rounded-full border-2 ${index === 0 ? "border-primary bg-primary" : "border-border-strong"}`} />
                <span className="ae-body text-text">{label}</span>
              </div>
            ))}
            <span className="ae-body-sm text-success-text">Sent to your Google Sheet</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
