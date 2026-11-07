"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";

import { cx } from "@/components/aiesec";
import { applyThemePreference } from "@/components/app/theme-client";
import type { ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
  { id: "system", label: "Match device", icon: <Monitor size={18} aria-hidden="true" /> },
  { id: "light", label: "Light", icon: <Sun size={18} aria-hidden="true" /> },
  { id: "dark", label: "Dark", icon: <Moon size={18} aria-hidden="true" /> },
];

export function ThemeChooser({ initial }: { initial: ThemePreference }) {
  const [theme, setTheme] = React.useState(initial);
  return (
    <fieldset className="ae-fieldset">
      <legend className="ae-fieldset__legend ae-label">Theme</legend>
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((option) => (
          <label
            key={option.id}
            className={cx(
              "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors duration-150",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
              theme === option.id ? "border-primary bg-primary-soft text-primary-text" : "border-border text-text hover:border-border-strong",
            )}
          >
            <input
              type="radio"
              name="theme"
              value={option.id}
              checked={theme === option.id}
              onChange={() => {
                applyThemePreference(option.id);
                setTheme(option.id);
              }}
              className="sr-only"
            />
            {option.icon}
            <span className="ae-body-sm">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
