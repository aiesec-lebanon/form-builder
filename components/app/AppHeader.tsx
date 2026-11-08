import { Navbar } from "@/components/aiesec";
import { AppMark } from "@/components/brand/Logo";
import type { CurrentUser } from "@/lib/auth/current-user";

import { UserMenu } from "./UserMenu";

/** The app header: the design system Navbar with the product mark and the account ProfileMenu. */
export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <Navbar
      sticky
      logoHref="/forms"
      logoLabel="AIESEC Forms home"
      logo={
        <>
          <span className="sm:hidden">
            <AppMark compact />
          </span>
          <span className="hidden sm:inline">
            <AppMark />
          </span>
        </>
      }
      profile={<UserMenu user={user} />}
    />
  );
}

export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-md bg-surface-raised px-4 py-2 ae-label text-primary-text shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[1400]"
    >
      Skip to content
    </a>
  );
}
