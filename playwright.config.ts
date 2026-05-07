import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright dla testów E2E dotyczących eksportu PDF Kanban.
 * Vitest (jsdom) pozostaje głównym runnerem jednostkowym — Playwright pokrywa
 * realne renderowanie w Chromium (np. download PDF, dialog diagnostyki).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [
        ["list"],
        ["junit", { outputFile: "reports/playwright/junit.xml" }],
        ["html", { outputFolder: "reports/playwright/html", open: "never" }],
      ]
    : [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "bun run build && bunx vite preview --port 4173 --strictPort",
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
