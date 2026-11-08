import NextLink from "next/link";

import { AppMark } from "@/components/brand/Logo";
import type { CurrentUser } from "@/lib/auth/current-user";

import { UserMenu } from "./UserMenu";

export function AppHeader({ user }: { user: CurrentUser }) {
  return (
    <header className="sticky top-0 z-[1100] border-b border-border bg-bg">
      <div className="ae-container flex h-16 items-center justify-between gap-4">
        <NextLink href="/forms" aria-label="AIESEC Forms home" className="no-underline">
          <span className="sm:hidden">
            <AppMark compact />
          </span>
          <span className="hidden sm:inline">
            <AppMark />
          </span>
        </NextLink>
        <div className="flex items-center gap-1">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
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
