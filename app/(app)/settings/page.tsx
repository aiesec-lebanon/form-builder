import type { Metadata } from "next";
import { cookies } from "next/headers";

import { Avatar } from "@/components/aiesec";
import { GoogleAccounts } from "@/components/settings/GoogleAccounts";
import { ThemeChooser } from "@/components/settings/ThemeChooser";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { googleConfigured } from "@/lib/env";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";

export const metadata: Metadata = { title: "Settings" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="ae-h4">{title}</h2>
        {description && <p className="ae-body-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SettingsPage({ searchParams }: Props) {
  const user = await requireUser("/settings");
  const params = await searchParams;
  const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);
  const connections = await db.googleConnection.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, status: true, createdAt: true, _count: { select: { destinations: true } } },
  });

  return (
    <div className="ae-container flex max-w-3xl flex-col gap-6 py-8 lg:py-12">
      <h1 className="ae-h2">Settings</h1>

      <Section title="Your profile" description="Your name, photo and position come from EXPA. Update them there.">
        <div className="flex items-center gap-4">
          <Avatar name={user.fullName} src={user.photoUrl ?? undefined} size="xl" decorative />
          <div className="flex flex-col gap-0.5">
            <p className="ae-h4">{user.fullName}</p>
            {(user.positionTitle || user.officeName) && <p className="ae-body-sm text-text-muted">{[user.positionTitle, user.officeName].filter(Boolean).join(" · ")}</p>}
            {user.email && <p className="ae-body-sm text-text-muted">{user.email}</p>}
          </div>
        </div>
      </Section>

      <Section title="Appearance">
        <ThemeChooser initial={theme} />
      </Section>

      <Section title="Google accounts" description="Used to create response Sheets and upload folders. AIESEC Forms can only see files it creates.">
        <GoogleAccounts
          configured={googleConfigured()}
          connections={connections.map((connection) => ({
            id: connection.id,
            email: connection.email,
            revoked: connection.status !== "active",
            connectedAt: connection.createdAt.toISOString(),
            usedBy: connection._count.destinations,
          }))}
          notice={typeof params.google === "string" ? "connected" : typeof params.google_error === "string" ? params.google_error : null}
        />
      </Section>

      <Section title="Sign out" description="Signs you out of AIESEC Forms on this browser.">
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="ae-btn ae-btn--secondary ae-body">
            Sign out
          </button>
        </form>
      </Section>
    </div>
  );
}
