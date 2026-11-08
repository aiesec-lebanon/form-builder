import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // The real package throws outside a React Server Components build.
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/support/setup.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      // Server and logic code: the gate CI enforces. React components are
      // covered by the Playwright suite (it needs a database, so it runs locally).
      include: ["lib/**/*.ts", "proxy.ts", "actions/**/*.ts", "app/api/**/*.ts"],
      exclude: ["**/*.d.ts", "lib/**/types.ts"],
      reporter: ["text-summary", "text", "lcov"],
      reportsDirectory: "coverage",
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
