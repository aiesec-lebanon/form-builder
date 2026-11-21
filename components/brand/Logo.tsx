import Image from "next/image";

import { cx } from "@/components/aiesec";

// Official AIESEC logo (design system Logos group). The blue variant reads on
// white, ae-bg-subtle and dark surfaces. Never recolour, stretch or animate it.
const LOGO_RATIO = 1188.5 / 169;

export function AiesecLogo({ height = 28, className, priority = false }: { height?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/aiesec-logo-blue.svg"
      alt="AIESEC"
      width={Math.round(height * LOGO_RATIO)}
      height={height}
      className={cx("block", className)}
      priority={priority}
      unoptimized
    />
  );
}

// The AIESEC Forms symbol: a text cursor whose arms are two answer fields.
// Drawn on a 256 grid; the viewBox crops to the mark. AIESEC Blue or white only.
const FORMS_SYMBOL_VIEWBOX = "39 32 178 192";
const FORMS_SYMBOL_PATH =
  "M67 32H95V224H67Z M49 32H113A10 10 0 0 1 113 52H49A10 10 0 0 1 49 32Z M81 32H193A24 24 0 0 1 193 80H81Z M81 108H157A24 24 0 0 1 157 156H81Z M49 204H113A10 10 0 0 1 113 224H49A10 10 0 0 1 49 204Z";
const FORMS_SYMBOL_RATIO = 178 / 192;

export function FormsSymbol({ size = 24, tone = "blue", className }: { size?: number; tone?: "blue" | "white"; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={FORMS_SYMBOL_VIEWBOX}
      width={Math.round(size * FORMS_SYMBOL_RATIO)}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cx("block flex-none", className)}
      style={{ fill: tone === "white" ? "var(--ae-white)" : "var(--ae-brand)" }}
    >
      <path d={FORMS_SYMBOL_PATH} />
    </svg>
  );
}

/** Footer sign-off: the symbol, the product name and the byline (never the "Powered by AIESEC" mark). */
export function FooterBrand({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-3", className)}>
      <FormsSymbol size={30} />
      <span className="flex flex-col text-left">
        <span className="ae-label text-text">AIESEC Forms</span>
        <span className="ae-caption text-text-muted">An initiative by AIESEC in Lebanon</span>
      </span>
    </span>
  );
}

/** The app mark: AIESEC logo, a hairline and the product name. */
export function AppMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3 sm:gap-4">
      <AiesecLogo height={compact ? 22 : 26} priority />
      <span aria-hidden="true" className="h-6 w-px bg-border" />
      <span className="ae-h4 text-text">Forms</span>
    </span>
  );
}
