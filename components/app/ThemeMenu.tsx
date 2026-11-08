"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import * as React from "react";

import type { ThemePreference } from "@/lib/theme";

import { Menu } from "./Menu";
import { applyThemePreference } from "./theme-client";

const OPTIONS: Array<{ id: ThemePreference; label: string; icon: LucideIcon }> = [
  { id: "system", label: "Match device", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

/** Theme switcher in the header, next to the account menu. The icon shows the current choice. */
export function ThemeMenu({ theme: initialTheme }: { theme: ThemePreference }) {
  const [theme, setTheme] = React.useState(initialTheme);
  const current = OPTIONS.find((option) => option.id === theme) ?? OPTIONS[0];
  const CurrentIcon = current.icon;

  return (
    <Menu
      label={`Theme: ${current.label}`}
      title="Theme"
      anchor="header"
      gap={8}
      minWidth={184}
      triggerClassName="inline-flex size-10 items-center justify-center rounded-full text-text-muted hover:bg-fill hover:text-text"
      trigger={<CurrentIcon size={20} aria-hidden="true" />}
      items={OPTIONS.map(({ id, label, icon: Icon }) => ({
        label,
        icon: <Icon size={16} />,
        checked: theme === id,
        onSelect: () => {
          applyThemePreference(id);
          setTheme(id);
        },
      }))}
    />
  );
}
