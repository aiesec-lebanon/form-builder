import { THEME_COOKIE, type ThemePreference } from "@/lib/theme";

/** Applies a theme instantly and remembers it for server renders (no reload, no flash). */
export function applyThemePreference(preference: ThemePreference): void {
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=31536000; samesite=lax`;
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}
