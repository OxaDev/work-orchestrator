import type { Locator } from "@playwright/test";

import { expect, type Page, test } from "./fixtures";
import { signIn } from "./helpers";

const suffix = Date.now().toString(36);

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

/** Drags with real mouse steps: React Flow listens to pointer moves. */
async function drag(page: Page, from: Locator, to: Locator) {
  const start = (await from.boundingBox())!;
  const end = (await to.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 });
  await page.mouse.up();
}

test("relate two domains in the graph, then export the Mermaid (P9-13)", async ({ page }) => {
  await signIn(page);
  const client = await post(page, "./api/v1/companies", { name: `Graph client ${suffix}` });
  const architecture = await post(page, "./api/v1/architectures", {
    company_id: client.id,
    name: `Graph SI ${suffix}`,
    description: "",
    lifecycle: "CURRENT",
  });
  for (const [name, kind] of [
    ["Front web", "APPLICATION"],
    ["API comptes", "SERVICE"],
  ]) {
    await post(page, "./api/v1/domains", {
      company_id: client.id,
      name,
      kind,
      description: "",
      lifecycle: "CURRENT",
      architecture_id: architecture.id,
    });
  }

  await page.goto(`./architecture/architectures/${architecture.id}`);
  await page.getByRole("link", { name: "Vue graphe" }).click();
  const front = page.locator(".react-flow__node", {
    has: page.getByRole("group", { name: "Application Front web" }),
  });
  const api = page.locator(".react-flow__node", {
    has: page.getByRole("group", { name: "Service API comptes" }),
  });
  await expect(front).toBeVisible();
  await expect(api).toBeVisible();

  // Drag from the right handle of one domain to the left handle of the other (P9-8).
  await drag(
    page,
    front.locator(".react-flow__handle-right"),
    api.locator(".react-flow__handle-left"),
  );
  const relation = page.getByRole("dialog", { name: "Nouvelle relation" });
  await expect(relation.getByRole("combobox", { name: "De", exact: true })).toHaveValue(
    "Front web",
  );
  await expect(relation.getByRole("combobox", { name: "Vers", exact: true })).toHaveValue(
    "API comptes",
  );
  await relation.getByRole("combobox", { name: "Protocole" }).fill("REST");
  await relation.getByRole("button", { name: "Enregistrer" }).click();
  await expect(relation).toBeHidden();
  await expect(page.locator(".react-flow__edge-text", { hasText: "Appelle (REST)" })).toBeVisible();

  // A domain moved by hand keeps its place (P9-9).
  const box = (await api.boundingBox())!;
  await page.mouse.move(box.x + 60, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 160, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`./api/v1/architectures/${architecture.id}/layout`)).json())
          .length,
    )
    .toBe(1);

  // Mermaid export: rendered preview, code, download (P9-11).
  await page.getByRole("button", { name: "Exporter en Mermaid" }).click();
  const exported = page.getByRole("dialog", { name: "Export Mermaid" });
  const code = exported.getByRole("textbox", { name: "Code Mermaid" });
  await expect(code).toHaveValue(/^%% Graph SI .+\nflowchart LR\n/);
  await expect(code).toHaveValue(/\["Front web"\]/);
  await expect(code).toHaveValue(/\(\["API comptes"\]\)/);
  await expect(code).toHaveValue(/-->\|"appelle \(REST\)"\|/);
  await expect(exported.getByRole("img", { name: "Diagramme" }).locator("svg")).toBeVisible();
  const download = page.waitForEvent("download");
  await exported.getByRole("button", { name: ".mmd" }).click();
  expect((await download).suggestedFilename()).toBe(`Graph-SI-${suffix}.mmd`);
});
