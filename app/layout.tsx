import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { dataThemeFor, parseThemePreference, THEME_COOKIE } from "@/lib/theme";

import { lato, raleway } from "./fonts";
import { Providers } from "./providers";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AIESEC Forms", template: "%s · AIESEC Forms" },
  description: "Build a form in a minute. Responses go straight to your Sheet, webhook or database.",
  applicationName: "AIESEC Forms",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#15171d" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const theme = dataThemeFor(parseThemePreference(store.get(THEME_COOKIE)?.value));

  return (
    <html lang="en" dir="ltr" data-theme={theme} className={`${lato.variable} ${raleway.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
