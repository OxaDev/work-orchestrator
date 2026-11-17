import { expect, type Page, test } from "./fixtures";
import { signIn } from "./helpers";

const suffix = Date.now().toString(36);

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function choose(
  page: Page,
  label: string,
  option: string | RegExp,
  scope = page.locator("body"),
) {
  await scope.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("an architecture is entered, then browsed through domain sheets (P8 DoD)", async ({
  page,
}) => {
  await signIn(page);
  const client = await post(page, "./api/v1/companies", { name: `Archi client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", {
    name: `Archi ESN ${suffix}`,
    types: ["ESN"],
  });
  const mission = await post(page, "./api/v1/missions", {
    title: `Archi mission ${suffix}`,
    job_title: "Architecte",
    client_id: client.id,
    employer_company_id: esn.id,
    start_date: "2030-01-01",
    objectives: "",
    description: "",
    review: "",
  });

  const project = await post(page, "./api/v1/projects", {
    mission_id: mission.id,
    name: `Projet ${suffix}`,
    description: "",
  });

  // The architecture is created from a project of the mission (Q-H1, ADR-0042).
  await page.goto(`./missions/${mission.id}/projects/${project.id}/architectures`);
  await page.getByRole("button", { name: "Nouvelle architecture" }).first().click();
  const create = page.getByRole("dialog", { name: "Nouvelle architecture" });
  await create.getByRole("textbox", { name: "Nom" }).fill(`SI ${suffix}`);
  await create.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: `SI ${suffix}`, level: 2 })).toBeVisible();

  // A business domain as entry point, then two sub-domains.
  await page.getByRole("button", { name: "Nouveau domaine" }).click();
  let dialog = page.getByRole("dialog", { name: "Nouveau domaine" });
  await dialog.getByRole("textbox", { name: "Nom" }).fill("Paiements");
  await choose(page, "Type", "Domaine métier", dialog);
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: "Paiements", level: 2 })).toBeVisible();

  for (const [name, kind] of [
    ["API Paiements", "Service"],
    ["Base Paiements", "Base de données"],
  ]) {
    await page.getByRole("tab", { name: /^Sous-domaines/ }).click();
    await page.getByRole("button", { name: "Nouveau sous-domaine" }).click();
    dialog = page.getByRole("dialog", { name: "Nouveau domaine" });
    await dialog.getByRole("textbox", { name: "Nom" }).fill(name!);
    await choose(page, "Type", kind!, dialog);
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByRole("heading", { name: name, level: 2 })).toBeVisible();
    await page.getByRole("link", { name: "Paiements", exact: true }).click();
  }

  // A relation from the API to its database (P8-10).
  await page.getByRole("tab", { name: /^Sous-domaines/ }).click();
  await page.getByRole("link", { name: "API Paiements" }).click();
  await page.getByRole("tab", { name: /^Relations/ }).click();
  await page.getByRole("button", { name: "Ajouter une relation sortante" }).click();
  dialog = page.getByRole("dialog", { name: "Nouvelle relation" });
  await choose(page, "Vers", "Paiements › Base Paiements", dialog);
  await choose(page, "Relation", "Écrit dans", dialog);
  await dialog.getByRole("combobox", { name: "Protocole" }).fill("JDBC");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  // Browsing: the database sheet shows the incoming relation and leads back to the API.
  await page.getByRole("link", { name: "Base Paiements" }).click();
  await page.getByRole("tab", { name: /^Relations/ }).click();
  await expect(page.getByRole("cell", { name: "Écrit dans" })).toBeVisible();
  await page.getByRole("link", { name: "API Paiements" }).click();
  await expect(page.getByRole("heading", { name: "API Paiements", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: `SI ${suffix}` })).toBeVisible();

  // The architecture page shows the whole subtree of its entry domain.
  await page.getByRole("link", { name: `SI ${suffix}` }).click();
  const tree = page.getByRole("tree", { name: "Domaines de l'architecture" });
  for (const name of ["Paiements", "API Paiements", "Base Paiements"]) {
    await expect(tree.getByRole("link", { name, exact: true })).toBeVisible();
  }
  const graph = await (
    await page.request.get(`./api/v1/architectures/${page.url().split("/").at(-1)}/graph`)
  ).json();
  expect(graph.nodes).toHaveLength(3);
  expect(graph.edges).toHaveLength(1);
});
