#!/usr/bin/env node
// Generates components/aiesec/tokens.css from the design system's tokens.json.
//
//   npm run tokens
//
// Output contract (what components/aiesec/bundle.css expects):
// - every token as a custom property `--<token-name>` (names already start `ae-`);
// - colour aliases kept as var() references, so a nested [data-theme] scope
//   re-resolves them against its own values;
// - light (first theme) values on :root; theme-dependent tokens re-declared on
//   [data-theme="light"], [data-theme="dark"] and, when the page sets no theme,
//   under prefers-color-scheme: dark;
// - one `.ae-<style>` class per type style.
// No @font-face rules: fonts are loaded with next/font (see app/fonts.ts).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "components/aiesec/tokens.json");
const outputPath = resolve(root, "components/aiesec/tokens.css");

const tokens = JSON.parse(readFileSync(sourcePath, "utf8"));
const themes = tokens.color.themes.map((theme) => theme.id);
const [firstTheme] = themes;
const ALIAS = /^\{([A-Za-z0-9][A-Za-z0-9_.-]*)\}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** Normalises a token value to { theme: raw }, missing themes inheriting the first. */
function perTheme(value) {
  const result = {};
  for (const theme of themes) {
    result[theme] = value !== null && typeof value === "object" ? (value[theme] ?? value[firstTheme]) : value;
  }
  return result;
}

// Themed families: colour and shadow. Untyped families: everything else.
const themed = new Map();
for (const family of ["color", "shadow"]) {
  for (const token of tokens[family]?.tokens ?? []) {
    if (!NAME.test(token.name)) throw new Error(`Invalid token name: ${token.name}`);
    themed.set(token.name, perTheme(token.value));
  }
}

function resolveLiteral(name, theme, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Alias cycle at ${name}`);
  seen.add(name);
  const raw = themed.get(name)?.[theme];
  if (raw === undefined) throw new Error(`Unknown token ${name}`);
  const alias = typeof raw === "string" ? raw.match(ALIAS) : null;
  return alias ? resolveLiteral(alias[1], theme, seen) : String(raw);
}

function cssValue(name, theme) {
  const raw = themed.get(name)[theme];
  const alias = typeof raw === "string" ? raw.match(ALIAS) : null;
  if (alias) {
    if (!themed.has(alias[1])) throw new Error(`${name} aliases missing token ${alias[1]}`);
    return `var(--${alias[1]})`;
  }
  return String(raw);
}

const themeDependent = [...themed.keys()].filter((name) => {
  const literals = themes.map((theme) => resolveLiteral(name, theme));
  return new Set(literals).size > 1;
});

const declarations = (names, theme, indent = "  ") =>
  names.map((name) => `${indent}--${name}: ${cssValue(name, theme)};`).join("\n");

const plainFamilies = Object.entries(tokens).filter(
  ([key, family]) => !["name", "version", "color", "shadow", "type"].includes(key) && Array.isArray(family?.tokens),
);

const lines = [];
lines.push(`/* ${tokens.name ?? "AIESEC"} — generated from tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */`);
lines.push("");
lines.push(":root {");
for (const [family, value] of Object.entries(tokens.type.families ?? {})) {
  lines.push(`  --font-${family}: ${value};`);
}
lines.push(declarations([...themed.keys()], firstTheme));
for (const [, family] of plainFamilies) {
  for (const token of family.tokens) {
    if (!NAME.test(token.name)) throw new Error(`Invalid token name: ${token.name}`);
    lines.push(`  --${token.name}: ${token.value};`);
  }
}
lines.push("}");

for (const theme of themes) {
  lines.push("");
  lines.push(`[data-theme="${theme}"] {`);
  lines.push(`  color-scheme: ${theme === "dark" ? "dark" : "light"};`);
  lines.push(declarations(themeDependent, theme));
  lines.push("}");
}

if (themes.includes("dark")) {
  lines.push("");
  lines.push("@media (prefers-color-scheme: dark) {");
  lines.push('  :root:not([data-theme="light"]) {');
  lines.push("    color-scheme: dark;");
  lines.push(declarations(themeDependent, "dark", "    "));
  lines.push("  }");
  lines.push("}");
}

lines.push("");
lines.push("/* Type styles */");
for (const group of tokens.type.groups ?? []) {
  for (const style of group.styles) {
    const props = [
      `font-family: var(--font-${group.family})`,
      `font-size: ${style.fontSize}`,
      `line-height: ${style.lineHeight}`,
      `font-weight: ${style.fontWeight}`,
    ];
    if (style.letterSpacing) props.push(`letter-spacing: ${style.letterSpacing}`);
    if (style.textTransform) props.push(`text-transform: ${style.textTransform}`);
    lines.push(`.${style.name} { ${props.join("; ")}; }`);
  }
}
lines.push("");

writeFileSync(outputPath, lines.join("\n"));
console.log(
  `tokens.css: ${themed.size} themed tokens (${themeDependent.length} theme-dependent), ` +
    `${plainFamilies.reduce((n, [, f]) => n + f.tokens.length, 0)} other tokens.`,
);
