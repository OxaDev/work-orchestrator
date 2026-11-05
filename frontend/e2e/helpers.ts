import { expect, type Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e-admin@example.com";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Admin-Pass-1";

/** Signs in through the UI; relative URLs keep the base path (ADR-0011). */
export async function signIn(page: Page, path = "./"): Promise<void> {
  await page.goto(path);
  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Se connecter|Sign in/ }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
}
