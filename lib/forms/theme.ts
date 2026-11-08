import type { FormStyle, ThemeMode } from "./schema";

// A form's look as the design system's data-theme value: calm is "light" and
// "dark" (no attribute follows the page and the OS); every other style is
// "<style>-light" or "<style>-dark", and the bare style name follows the OS
// (tokens.css switches it under prefers-color-scheme).
export function formThemeAttribute(style: FormStyle, mode: ThemeMode): string | undefined {
  if (style === "calm") return mode === "auto" ? undefined : mode;
  return mode === "auto" ? style : `${style}-${mode}`;
}
