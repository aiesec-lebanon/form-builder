// App colour scheme preference, kept in a cookie so the server can render
// data-theme on <html> with no flash and no inline script. "system" renders no
// attribute and tokens.css follows prefers-color-scheme.

export const THEME_COOKIE = "theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function parseThemePreference(value: string | undefined | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

/** The data-theme attribute for a preference; undefined means follow the OS. */
export function dataThemeFor(preference: ThemePreference): "light" | "dark" | undefined {
  return preference === "system" ? undefined : preference;
}
