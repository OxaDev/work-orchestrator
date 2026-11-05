import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the isolated e2e Docker stack (`make test-e2e`), under the base path
 * (ADR-0011, ADR-0016). Override with E2E_BASE_URL, e.g. http://127.0.0.1:5173/work-orchestrator/.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:18081/work-orchestrator/";

export default defineConfig({
  testDir: "./e2e",
  // One worker: tests share the e2e admin account and its stored preferences.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
