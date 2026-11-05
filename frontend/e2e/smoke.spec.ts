import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("home page loads assets and reaches the API through the base path", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Work Orchestrator", level: 2 })).toBeVisible();
  await expect(page.getByText("API et base de données opérationnelles")).toBeVisible();
});

test("deep link survives a full page reload", async ({ page }) => {
  await page.goto("./documents");
  await expect(page.getByText(/phase P7/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/phase P7/)).toBeVisible();
});
