"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { ProfileMenu, type ProfileMenuLink } from "@/components/aiesec";

type Props = {
  user: { fullName: string; email: string | null; workEmail: string | null; photoUrl: string | null; positionTitle: string | null; officeName: string | null; isAdmin: boolean };
};

/** Menu links that know which page you're on (styled in globals.css). */
const CurrentPageLink = React.forwardRef<HTMLAnchorElement, React.ComponentProps<typeof NextLink>>(function CurrentPageLink({ href, ...rest }, ref) {
  const pathname = usePathname() ?? "";
  const target = typeof href === "string" ? href : (href.pathname ?? "");
  const current = target !== "" && (pathname === target || pathname.startsWith(`${target}/`));
  return <NextLink ref={ref} href={href} aria-current={current ? "page" : undefined} {...rest} />;
});

/** The account button in the header: the design system's ProfileMenu (who's signed in, Settings, Admin activity, Sign out). */
export function UserMenu({ user }: Props) {
  const signOutRef = React.useRef<HTMLFormElement>(null);
  const links: ProfileMenuLink[] = [
    { label: "Settings", href: "/settings", icon: "settings" },
    ...(user.isAdmin ? [{ label: "Admin activity", href: "/admin/activity", icon: "eye" as const }] : []),
  ];

  return (
    <>
      <ProfileMenu
        name={user.fullName}
        src={user.photoUrl ?? undefined}
        position={user.positionTitle ?? undefined}
        entity={user.officeName ?? undefined}
        email={user.workEmail ?? user.email ?? undefined}
        links={links}
        onSignOut={() => signOutRef.current?.requestSubmit()}
        linkComponent={CurrentPageLink}
      />
      <form ref={signOutRef} action="/api/auth/logout" method="post" hidden />
    </>
  );
}
