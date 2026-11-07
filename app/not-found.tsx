import { Button } from "@/components/aiesec";
import { AppMark } from "@/components/brand/Logo";

export default function NotFound() {
  return (
    <main className="ae-container flex min-h-dvh flex-col py-8">
      <AppMark />
      <div className="flex flex-1 items-center py-12">
        <div className="flex max-w-lg flex-col gap-6">
          <h1 className="ae-h1">
            We can&apos;t find <strong>that page</strong>
          </h1>
          <p className="ae-body-lg text-text-muted">The link may be wrong, or the form may have been moved or deleted. If someone shared it with you, ask them for a new link.</p>
          <div>
            <Button href="/forms" variant="primary">
              Go to your forms
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
