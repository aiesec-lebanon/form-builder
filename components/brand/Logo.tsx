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

const POWERED_RATIO = 1182 / 267.5;

/** "Powered by AIESEC" endorsement, swapping to the white-text variant on dark surfaces. */
export function PoweredByAiesec({ height = 28 }: { height?: number }) {
  const width = Math.round(height * POWERED_RATIO);
  return (
    <span className="inline-block">
      <Image src="/brand/powered-by-aiesec-blue.svg" alt="Powered by AIESEC" width={width} height={height} className="block dark:hidden" unoptimized />
      <Image src="/brand/powered-by-aiesec-white-blue.svg" alt="Powered by AIESEC" width={width} height={height} className="hidden dark:block" unoptimized />
    </span>
  );
}
