// Required fields carry a red asterisk (faster to spot than "(optional)" text).
// Hovering it says "Required", and every form with one shows the legend below,
// so people who don't know the convention can still tell.

/**
 * The asterisk after a label. `announce` adds "(required)" for screen readers;
 * leave it off when the control itself is marked required (aria-required or the
 * native attribute), or it's read twice.
 */
export function RequiredMark({ announce = false }: { announce?: boolean }) {
  return (
    <>
      <span aria-hidden="true" title="Required" className="fb-required">
        *
      </span>
      {announce && <span className="sr-only"> (required)</span>}
    </>
  );
}

/** "* Required" key, shown once near the top of a form that has required fields. */
export function RequiredLegend({ className }: { className?: string }) {
  return (
    <p aria-hidden="true" className={["ae-body-sm text-text-muted", className].filter(Boolean).join(" ")}>
      <span className="fb-required ms-0 me-1">*</span>
      Required
    </p>
  );
}
