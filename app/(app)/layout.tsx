import { cookies } from "next/headers";

import { AppHeader, SkipLink } from "@/components/app/AppHeader";
import { requireUser } from "@/lib/auth/current-user";
import { parseThemePreference, THEME_COOKIE } from "@/lib/theme";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const theme = parseThemePreference((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <AppHeader user={user} theme={theme} />
      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
