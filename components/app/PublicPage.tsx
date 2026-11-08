import NextLink from "next/link";

import { AppMark } from "@/components/brand/Logo";

// Shell for public reading pages (terms, privacy, report a form): one centred
// column, so the logo, the content and the footer share the same edges.
const COLUMN = "mx-auto w-full max-w-[44rem] px-4 sm:px-6";

export function PublicPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="border-b border-border">
        <div className={`${COLUMN} flex h-16 items-center`}>
          <NextLink href="/" aria-label="AIESEC Forms home" className="no-underline">
            <AppMark compact />
          </NextLink>
        </div>
      </header>
      <main id="main" className={`${COLUMN} flex-1 py-10 lg:py-14`}>
        {children}
      </main>
      <footer className="border-t border-border">
        <nav aria-label="Legal" className={`${COLUMN} flex flex-wrap items-center gap-x-5 gap-y-2 py-6 ae-caption text-text-muted`}>
          <span>AIESEC Forms is run by AIESEC in Lebanon.</span>
          <NextLink href="/terms" className="ae-link">
            Terms of Service
          </NextLink>
          <NextLink href="/privacy" className="ae-link">
            Privacy Policy
          </NextLink>
        </nav>
      </footer>
    </div>
  );
}
