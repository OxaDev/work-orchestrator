import { expect, test } from "@playwright/test";

import { E2E_EMAIL, signIn } from "./helpers";

test("anonymous deep link goes through login and back", async ({ page }) => {
  await page.goto("./settings/password");
  await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fpassword$/);
  await signIn(page, page.url());
  await expect(page).toHaveURL(/\/settings\/password$/);
  await expect(page.getByLabel("Mot de passe actuel")).toBeVisible();
});

test("wrong credentials show a generic message", async ({ page }) => {
  // Unknown e-mail: does not count against the e2e admin's lockout counter.
  await page.goto("./login");
  await page.getByLabel("E-mail").fill("nobody@example.com");
  await page.getByLabel("Mot de passe").fill("Wrong-Password-1");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("alert")).toContainText("E-mail ou mot de passe incorrect.");
});

test("auth cookies are httpOnly, SameSite=Strict and scoped to the base path", async ({
  page,
  context,
}) => {
  await signIn(page);
  const cookies = await context.cookies();
  const access = cookies.find((c) => c.name === "wo_access");
  const refresh = cookies.find((c) => c.name === "wo_refresh");
  expect(access).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/work-orchestrator" });
  expect(refresh).toMatchObject({ httpOnly: true, path: "/work-orchestrator/api/v1/auth" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("wo_");
});

test("session survives a reload, then sign-out ends it", async ({ page }) => {
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir le menu utilisateur" }).click();
  await expect(page.getByText(E2E_EMAIL)).toBeVisible();
  await page.getByText("Se déconnecter").click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("./settings");
  await expect(page).toHaveURL(/\/login/);
});

test("language preference is stored on the profile", async ({ page }) => {
  await signIn(page);
  await page.getByText("EN", { exact: true }).click();
  await expect(page.getByRole("navigation").getByText("Directory")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation").getByText("Directory")).toBeVisible();
  // Restore French for the other tests.
  await page.getByText("FR", { exact: true }).click();
  await expect(page.getByRole("navigation").getByText("Annuaire")).toBeVisible();
});

test("admin sees the users administration", async ({ page }) => {
  await signIn(page, "./settings/users");
  await expect(page.getByRole("cell", { name: E2E_EMAIL, exact: true })).toBeVisible();
});
