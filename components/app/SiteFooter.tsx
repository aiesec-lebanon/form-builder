import NextLink from "next/link";

import { cx } from "@/components/aiesec";
import { FooterBrand } from "@/components/brand/Logo";

/**
 * The footer on every page except the full-screen builder: the AIESEC Forms
 * sign-off and the legal links. Public forms use FormFooter instead.
 */
export function SiteFooter({ containerClassName = "ae-container" }: { containerClassName?: string }) {
  return (
    <footer className="border-t border-border">
      <div className={cx(containerClassName, "flex flex-col gap-4 py-6 sm:flex-row sm:items-center sm:justify-between")}>
        <FooterBrand />
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2 ae-caption text-text-muted">
          <NextLink href="/terms" className="ae-link">
            Terms of Service
          </NextLink>
          <NextLink href="/privacy" className="ae-link">
            Privacy Policy
          </NextLink>
        </nav>
      </div>
    </footer>
  );
}
