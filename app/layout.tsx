import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AIESEC Forms",
  description: "Build forms in minutes. Responses go straight to your Sheet, webhook or database.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
