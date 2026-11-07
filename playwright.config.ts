import { defineConfig, devices } from "@playwright/test";

// Smoke tests against a running dev server started with DEV_LOGIN=1:
//   npm run dev   (in one terminal)
//   npm run e2e   (in another)
// PW_CHROMIUM_PATH can point at an already-installed Chromium.
const launchOptions = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: "phone", use: { ...devices["Pixel 7"], launchOptions } },
  ],
});
