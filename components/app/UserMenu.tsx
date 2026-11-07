"use client";

import { Activity, LogOut, Monitor, Moon, Settings, Sun } from "lucide-react";
import * as React from "react";

import { Avatar } from "@/components/aiesec";
import type { ThemePreference } from "@/lib/theme";

import { Menu } from "./Menu";
import { applyThemePreference } from "./theme-client";

type Props = {
  user: { fullName: string; photoUrl: string | null; positionTitle: string | null; officeName: string | null; isAdmin: boolean };
  theme: ThemePreference;
};

export function UserMenu({ user, theme: initialTheme }: Props) {
  const [theme, setTheme] = React.useState(initialTheme);
  const signOutRef = React.useRef<HTMLFormElement>(null);

  const chooseTheme = (preference: ThemePreference) => {
    applyThemePreference(preference);
    setTheme(preference);
  };

  const subtitle = [user.positionTitle, user.officeName].filter(Boolean).join(" · ");

  return (
    <>
      <Menu
        label="Account menu"
        triggerClassName="inline-flex rounded-full p-0.5 hover:bg-bg-subtle"
        trigger={<Avatar name={user.fullName} src={user.photoUrl ?? undefined} size="md" decorative />}
        minWidth={248}
        items={[
          {
            kind: "label",
            content: (
              <div className="flex flex-col">
                <span className="ae-label text-text">{user.fullName}</span>
                {subtitle && <span className="ae-caption text-text-muted">{subtitle}</span>}
              </div>
            ),
          },
          { kind: "separator" },
          { label: "Settings", href: "/settings", icon: <Settings size={16} /> },
          ...(user.isAdmin ? [{ label: "Activity", href: "/admin/activity", icon: <Activity size={16} /> }] : []),
          { kind: "separator" },
          { kind: "label", content: <span className="ae-caption text-text-muted">Theme</span> },
          { label: "System", icon: <Monitor size={16} />, checked: theme === "system", onSelect: () => chooseTheme("system") },
          { label: "Light", icon: <Sun size={16} />, checked: theme === "light", onSelect: () => chooseTheme("light") },
          { label: "Dark", icon: <Moon size={16} />, checked: theme === "dark", onSelect: () => chooseTheme("dark") },
          { kind: "separator" },
          { label: "Sign out", icon: <LogOut size={16} />, onSelect: () => signOutRef.current?.requestSubmit() },
        ]}
      />
      <form ref={signOutRef} action="/api/auth/logout" method="post" hidden />
    </>
  );
}
