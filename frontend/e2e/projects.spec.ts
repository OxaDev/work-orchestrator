import { expect, type Page, test } from "./fixtures";
import { signIn } from "./helpers";

const suffix = Date.now().toString(36);

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("a project scopes documents and architectures (ADR-0042)", async ({ page }) => {
  await signIn(page);
  const client = await post(page, "./api/v1/companies", { name: `Proj client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", {
    name: `Proj ESN ${suffix}`,
    types: ["ESN"],
  });
  const mission = await post(page, "./api/v1/missions", {
    title: `Proj mission ${suffix}`,
    job_title: "Dev",
    client_id: client.id,
    employer_company_id: esn.id,
    start_date: "2030-01-01",
    objectives: "",
    description: "",
    review: "",
  });
  await post(page, "./api/v1/documents", { title: `Hors projet ${suffix}`, content_md: "" });

  // The project is created from the mission and becomes the work context.
  await page.goto(`./missions/${mission.id}?tab=projects`);
  await page.getByRole("button", { name: "Nouveau projet" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nouveau projet" });
  await dialog.getByRole("textbox", { name: "Nom" }).fill(`Projet ${suffix}`);
  await dialog.getByRole("button", { name: "Nouveau projet" }).click();
  await expect(page.getByRole("heading", { name: `Projet ${suffix}`, level: 2 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Projet courant" })).toHaveValue(
    `Projet ${suffix}`,
  );

  // A page created in the project, then a sub-page.
  await page.getByRole("button", { name: "Nouveau document" }).click();
  let create = page.getByRole("dialog", { name: "Nouveau document" });
  await create.getByRole("textbox", { name: "Titre" }).fill(`Racine ${suffix}`);
  await create.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByRole("textbox", { name: "Titre" })).toHaveValue(`Racine ${suffix}`);

  // The documents page shows the current project only.
  await page.goto("./documents");
  await expect(page.getByRole("link", { name: `Racine ${suffix}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Hors projet ${suffix}` })).toHaveCount(0);
  await page.getByRole("button", { name: `Nouvelle sous-page de Racine ${suffix}` }).click();
  create = page.getByRole("dialog", { name: "Nouveau document" });
  await create.getByRole("textbox", { name: "Titre" }).fill(`Enfant ${suffix}`);
  await create.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByRole("textbox", { name: "Titre" })).toHaveValue(`Enfant ${suffix}`);
  const listed = await (
    await page.request.get("./api/v1/documents", { params: { q: `Enfant ${suffix}` } })
  ).json();
  const project = (
    await (
      await page.request.get("./api/v1/projects", { params: { mission_id: mission.id } })
    ).json()
  ).items[0];
  expect(listed[0].project_id).toBe(project.id);
});
