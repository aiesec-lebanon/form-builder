"use client";

import { Activity, LogOut, Settings } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { Avatar } from "@/components/aiesec";

import { Menu } from "./Menu";

type Props = {
  user: { fullName: string; email: string | null; workEmail: string | null; photoUrl: string | null; positionTitle: string | null; officeName: string | null; isAdmin: boolean };
};

/** The account card: who's signed in, settings, admin activity and sign out. Opens below the header, aligned to the avatar. */
export function UserMenu({ user }: Props) {
  const signOutRef = React.useRef<HTMLFormElement>(null);
  const pathname = usePathname() ?? "";
  const role = [user.positionTitle, user.officeName].filter(Boolean).join(" · ");

  return (
    <>
      <Menu
        label={`Account: ${user.fullName}`}
        title={user.fullName}
        anchor="header"
        gap={8}
        triggerClassName="inline-flex rounded-full p-0.5 hover:bg-fill"
        trigger={<Avatar name={user.fullName} src={user.photoUrl ?? undefined} size="md" decorative />}
        minWidth={280}
        items={[
          {
            kind: "label",
            content: (
              <div className="flex items-center gap-3 pb-1">
                <Avatar name={user.fullName} src={user.photoUrl ?? undefined} size="md" decorative />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate ae-label text-text">{user.fullName}</span>
                  {role && <span className="truncate ae-caption text-text-muted">{role}</span>}
                  {(user.workEmail ?? user.email) && <span className="truncate ae-caption text-text-muted">{user.workEmail ?? user.email}</span>}
                </div>
              </div>
            ),
          },
          { kind: "separator" },
          { label: "Settings", href: "/settings", icon: <Settings size={16} />, current: pathname.startsWith("/settings") },
          ...(user.isAdmin ? [{ label: "Admin activity", href: "/admin/activity", icon: <Activity size={16} />, current: pathname.startsWith("/admin") }] : []),
          { kind: "separator" },
          { label: "Sign out", icon: <LogOut size={16} />, tone: "danger", onSelect: () => signOutRef.current?.requestSubmit() },
        ]}
      />
      <form ref={signOutRef} action="/api/auth/logout" method="post" hidden />
    </>
  );
}
