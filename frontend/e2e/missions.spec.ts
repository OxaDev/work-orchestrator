import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

const suffix = Date.now().toString(36);

test("create a mission with the wizard, then staff and weight it", async ({ page }) => {
  await signIn(page);
  // Set-up through the API (same session cookies): a client, an ESN and a contact.
  const client = await (
    await page.request.post("./api/v1/companies", { data: { name: `Client ${suffix}` } })
  ).json();
  await page.request.post("./api/v1/companies", {
    data: { name: `ESN ${suffix}`, types: ["ESN"] },
  });
  await page.request.post("./api/v1/contacts", {
    data: { first_name: "Grace", last_name: `Hopper ${suffix}`, company_id: client.id },
  });

  await page.goto("./missions");
  await page.getByRole("button", { name: "Nouvelle mission" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Client" }).click();
  await page.getByRole("option", { name: `Client ${suffix}` }).click();
  await dialog.getByRole("combobox", { name: "ESN" }).click();
  await page.getByRole("option", { name: `ESN ${suffix}` }).click();
  await dialog.getByRole("button", { name: "Suivant" }).click();
  await dialog.getByLabel("Intitulé de poste").fill("Architecte");
  await dialog.getByRole("button", { name: "Suivant" }).click();
  await dialog.getByLabel("Date de début").fill("2026-02-02");
  await dialog.getByRole("button", { name: "Nouvelle mission" }).click();

  const title = `Client ${suffix} — Architecte`;
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText(`via ESN ${suffix}`)).toBeVisible();

  await page.getByRole("tab", { name: /^Technologies/ }).click();
  await page.getByRole("combobox", { name: "Ajouter une technologie" }).fill("kafka");
  await page.getByRole("option", { name: "Apache Kafka" }).click();
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("table").getByText("Apache Kafka")).toBeVisible();

  await page.getByRole("tab", { name: /^Contacts/ }).click();
  await page.getByRole("combobox", { name: "Ajouter un contact" }).fill("hopper");
  await page.getByRole("option", { name: new RegExp(`Grace Hopper ${suffix}`) }).click();
  await page.getByRole("combobox", { name: "Rôle" }).click();
  await page.getByRole("option", { name: "Architecte" }).click();
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByRole("link", { name: `Grace Hopper ${suffix}` })).toBeVisible();

  await page.goto("./missions");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
