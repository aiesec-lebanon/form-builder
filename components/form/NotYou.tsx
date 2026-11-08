// "Not you?" on AIESEC-only forms: forgets the respondent and returns to the form (ADR-013).
export function NotYou({ slug, label = "Not you? Use another account" }: { slug: string; label?: string }) {
  return (
    <form method="post" action={`/api/auth/respondent/logout?returnTo=${encodeURIComponent(`/f/${slug}`)}`} className="inline">
      <button type="submit" className="ae-link ae-body-sm">
        {label}
      </button>
    </form>
  );
}
