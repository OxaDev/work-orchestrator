import { expect, type Page, test } from "./fixtures";
import { signIn } from "./helpers";

const suffix = Date.now().toString(36);
// 1×1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("a page with a Mermaid diagram and internal links copies cleanly (P7 DoD)", async ({
  page,
}) => {
  await signIn(page);
  const client = await post(page, "./api/v1/companies", { name: `Doc client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", { name: `Doc ESN ${suffix}`, types: ["ESN"] });
  const mission = await post(page, "./api/v1/missions", {
    title: `Doc mission ${suffix}`,
    job_title: "Dev",
    client_id: client.id,
    employer_company_id: esn.id,
    start_date: "2030-01-01",
    objectives: "",
    description: "",
    review: "",
  });

  await page.goto("./documents");
  await page.getByRole("button", { name: "Nouveau document" }).first().click();
  const create = page.getByRole("dialog", { name: "Nouveau document" });
  await create.getByRole("textbox", { name: "Titre" }).fill(`Architecture ${suffix}`);
  await create.getByRole("button", { name: "Créer" }).click();

  // Raw Markdown is typed in the "Markdown" mode; the live editor is the default (ADR-0043).
  const modes = page.getByRole("radiogroup", { name: "Affichage" });
  await modes.getByText("Markdown", { exact: true }).click();
  // Typing "[[" opens the completion on every linkable entity (P7-9).
  const editor = page.getByRole("textbox", { name: "Contenu Markdown" });
  await editor.click();
  await page.keyboard.type(`Voir [[Doc mission ${suffix}`);
  await page.getByRole("option", { name: new RegExp(`Doc mission ${suffix}`) }).click();
  await page.keyboard.insertText("\n\n```mermaid\nflowchart LR\n  Front --> API\n```\n");

  await modes.getByText("Aperçu", { exact: true }).click();
  const preview = page.getByRole("region", { name: "Aperçu" });
  await expect(preview.getByRole("link", { name: `Doc mission ${suffix}` })).toHaveAttribute(
    "href",
    new RegExp(`/missions/${mission.id}$`),
  );
  await expect(preview.getByRole("img", { name: "Diagramme" }).locator("svg")).toBeVisible();

  // An image inserted from a file is uploaded and shown (P7-5, P7-10).
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Insérer un fichier" }).click();
  await (await chooser).setFiles({ name: "capture.png", mimeType: "image/png", buffer: PNG });
  const image = preview.getByRole("img", { name: "capture.png" });
  await expect(image).toBeVisible();
  const served = await page.request.get((await image.getAttribute("src"))!);
  expect(served.status()).toBe(200);
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");

  // Focus is on the file button: the shortcut works on the whole page.
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.getByText("Toutes les modifications sont enregistrées")).toBeVisible();

  // Copy as Markdown: labels instead of wikilinks, Mermaid kept, or SVG on demand (P7-11).
  await page.getByRole("button", { name: "Exporter" }).click();
  const exported = page.getByRole("dialog", { name: "Copier en Markdown" });
  const result = exported.getByRole("textbox", { name: "Markdown à coller" });
  await expect(result).toHaveValue(new RegExp(`^Voir Doc mission ${suffix}`));
  await expect(result).toHaveValue(/```mermaid\nflowchart LR/);
  await expect(result).toHaveValue(
    /!\[capture\.png\]\(http:\/\/.+\/api\/v1\/attachments\/[0-9a-f-]+\)/,
  );
  await exported.getByRole("switch", { name: /Diagrammes en images SVG/ }).click();
  await expect(result).toHaveValue(/!\[diagram 1\]\(data:image\/svg\+xml;base64,/);
  await page.keyboard.press("Escape");

  // The mission lists the document among those linking to it (backlinks).
  await page.goto(`./missions/${mission.id}?tab=documents`);
  await expect(page.getByRole("link", { name: `Architecture ${suffix}` })).toBeVisible();
});
