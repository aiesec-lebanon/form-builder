import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Use lib/logger so output is structured and redacted.
      "no-console": "error",
    },
  },
  {
    files: ["scripts/**", "public/**"],
    rules: { "no-console": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored design system: replaced wholesale on update, never edited here.
    "components/aiesec/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
