import { AppHeader, SkipLink } from "@/components/app/AppHeader";
import { requireUser } from "@/lib/auth/current-user";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader user={user} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
