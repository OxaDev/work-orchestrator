import { readFile } from "node:fs/promises";

import { expect, type Page, test } from "./fixtures";
import { signIn, zip } from "./helpers";

// Letters only: search splits words on non-word characters (ADR-0040).
const suffix = Date.now()
  .toString(36)
  .replace(/\d/g, (d) => "abcdefghij".charAt(Number(d)));

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("Ctrl+K finds a document by a word of its content and opens it (P11-3)", async ({ page }) => {
  await signIn(page);
  await post(page, "./api/v1/documents", {
    title: `Note de recherche ${suffix}`,
    content_md: `Les consommateurs quokka${suffix} relisent les messages.`,
  });
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("textbox", { name: /Rechercher partout|Search everything/ });
  await input.fill(`quokka${suffix}`);
  await expect(page.locator("mark", { hasText: `quokka${suffix}` })).toBeVisible();
  await page.getByText(`Note de recherche ${suffix}`).click();
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: /^(Titre|Title)$/ })).toHaveValue(
    `Note de recherche ${suffix}`,
  );
});

test("a Markdown vault and a CSV of contacts come in (P11-6, P11-7)", async ({ page }) => {
  await signIn(page, "./documents");
  await page.getByRole("button", { name: /Importer du Markdown|Import Markdown/ }).click();
  const vault = page.getByRole("dialog");
  await vault.locator('input[type="file"]').setInputFiles({
    name: "vault.zip",
    mimeType: "application/zip",
    buffer: zip({
      [`Vault ${suffix}/Index.md`]: `# Index ${suffix}\n\nVoir [[Kafka]].\n`,
      [`Vault ${suffix}/Kafka.md`]: `# Kafka ${suffix}\n\nTopics.\n`,
    }),
  });
  await vault.getByRole("button", { name: /^(Importer|Import)$/ }).click();
  await expect(vault.getByText(/^2 documents$/)).toBeVisible();
  await vault.getByRole("button", { name: /Fermer|Close/ }).click();
  await page.getByRole("link", { name: `Index ${suffix}` }).click();
  // The Obsidian wikilink now points at the imported note.
  await page.getByRole("link", { name: "Kafka", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^(Titre|Title)$/ })).toHaveValue(
    `Kafka ${suffix}`,
  );

  await page.goto("./directory/contacts");
  await page.getByRole("button", { name: /Importer un CSV|Import CSV/ }).click();
  const csv = page.getByRole("dialog");
  await csv.locator('input[type="file"]').setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `first_name;last_name;email_work;company\nAda;Csv${suffix};;Csv Corp ${suffix}\n;;;\n`,
    ),
  });
  await expect(csv.getByText(/^1 (à créer|to create)/)).toBeVisible();
  await csv.getByRole("button", { name: /Importer 1 contact|Import 1 contact/ }).click();
  await expect(csv).toBeHidden();
  await page.getByPlaceholder(/Nom, e-mail, poste|Name, e-mail, job/).fill(`Csv${suffix}`);
  await expect(page.getByRole("cell", { name: `Csv Corp ${suffix}` })).toBeVisible();
});

test("the archive downloads, and is refused where its ids already exist (P11-4, P11-5)", async ({
  page,
}) => {
  await signIn(page, "./settings/data");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Télécharger l'archive|Download the archive/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^work-orchestrator-\d{4}-\d{2}-\d{2}\.zip$/);
  const archive = await readFile(await file.path());
  expect(archive.subarray(0, 2).toString()).toBe("PK");

  // A fresh account on the same instance: the archive's ids are already taken.
  const email = `p11-${suffix}@example.com`;
  const password = "Fresh-Account-Pass-42";
  await post(page, "./api/v1/users", { email, display_name: `P11 ${suffix}`, password });
  await page.context().clearCookies();
  await page.goto("./settings/data");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(password);
  await page.getByRole("button", { name: /Se connecter|Sign in/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "archive.zip",
    mimeType: "application/zip",
    buffer: archive,
  });
  await page.getByRole("button", { name: /^(Importer|Import)$/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^(Importer|Import)$/ })
    .click();
  await expect(
    page.getByText(/existe déjà dans cette instance|already exists in this instance/),
  ).toBeVisible();
});
