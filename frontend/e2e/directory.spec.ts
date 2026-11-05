import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

// The e2e stack persists between runs: use unique names.
const suffix = Date.now().toString(36);

test("company, organisation and contact end to end", async ({ page }) => {
  const company = `Banque E2E ${suffix}`;
  await signIn(page, "./directory/companies");

  await page.getByRole("button", { name: "Nouvelle entreprise" }).click();
  const companyDialog = page.getByRole("dialog");
  await companyDialog.getByLabel("Nom", { exact: true }).fill(company);
  await companyDialog.getByRole("combobox", { name: "Secteur principal" }).click();
  await page.getByRole("option", { name: /Banque de détail/ }).click();
  await companyDialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: company })).toBeVisible();

  await page.getByRole("tab", { name: "Organisation" }).click();
  await page.getByRole("button", { name: "Nouvelle unité" }).click();
  await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("DSI");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await page.getByRole("button", { name: "Ajouter une unité sous DSI" }).click();
  await page.getByRole("dialog").getByLabel("Nom", { exact: true }).fill("Équipe Paiements");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  const tree = page.getByRole("tree", { name: "Organisation" });
  await expect(tree.getByRole("treeitem", { name: /Équipe Paiements/ })).toHaveAttribute(
    "aria-level",
    "2",
  );

  await page
    .getByRole("tab", { name: /^Contacts/ })
    .last()
    .click();
  await page.getByRole("link", { name: "Nouveau contact" }).click();
  const contactDialog = page.getByRole("dialog");
  await contactDialog.getByLabel("Prénom").fill("Ada");
  await contactDialog.getByLabel("Nom", { exact: true }).fill(`Lovelace ${suffix}`);
  await contactDialog.getByRole("combobox", { name: "Unité organisationnelle" }).click();
  await page.getByRole("option", { name: /Équipe Paiements/ }).click();
  await contactDialog.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.getByRole("heading", { name: `Ada Lovelace ${suffix}` })).toBeVisible();
  await expect(page.getByRole("link", { name: company })).toBeVisible();
});

test("reference data is available", async ({ page }) => {
  await signIn(page, "./directory/technologies");
  await page.getByRole("textbox", { name: "Rechercher" }).fill("k8s");
  await expect(page.getByRole("cell", { name: "Kubernetes", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Secteurs" }).click();
  await expect(page.getByRole("treeitem", { name: /Banque de détail/ })).toBeVisible();
});
