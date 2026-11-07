import type { Metadata } from "next";

import { Button } from "@/components/aiesec";
import { AppMark } from "@/components/brand/Logo";

export const metadata: Metadata = { title: "Not available for this account" };

export default function UnauthorizedPage() {
  return (
    <main className="ae-container flex min-h-dvh flex-col py-8">
      <AppMark />
      <div className="flex flex-1 items-center py-12">
        <div className="flex max-w-lg flex-col gap-6">
          <h1 className="ae-h1">
            This account can&apos;t use <strong>AIESEC Forms</strong> yet
          </h1>
          <p className="ae-body-lg text-text-muted">
            AIESEC Forms is for members with a current position in EXPA. If you hold one, ask your entity to update your position in EXPA, then sign in again.
          </p>
          <div>
            <Button href="/login" variant="primary">
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
