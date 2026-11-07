"use client";

import NextLink from "next/link";

import { LinkProvider, ToastProvider } from "@/components/aiesec";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LinkProvider component={NextLink}>
      <ToastProvider>{children}</ToastProvider>
    </LinkProvider>
  );
}
