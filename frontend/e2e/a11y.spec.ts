import AxeBuilder from "@axe-core/playwright";

import { expect, type Page, test } from "./fixtures";
import { signIn } from "./helpers";

const suffix = Date.now().toString(36);

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

/** WCAG 2.1 A and AA, contrasts included (P12-3). */
async function audit(page: Page, name: string): Promise<string[]> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${name}: ${v.id} (${v.impact}) ` +
      v.nodes.map((n) => `${n.html.slice(0, 160)} — ${n.failureSummary ?? ""}`).join(" | "),
  );
  return summary;
}

test("main pages pass an axe audit in both colour schemes (P12-3)", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const client = await post(page, "./api/v1/companies", { name: `A11y client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", {
    name: `A11y ESN ${suffix}`,
    types: ["ESN"],
  });
  const mission = await post(page, "./api/v1/missions", {
    title: `A11y mission ${suffix}`,
    job_title: "Dev",
    client_id: client.id,
    employer_company_id: esn.id,
    start_date: "2026-01-05",
    planned_end_date: "2026-12-31",
    objectives: "",
    description: "",
    review: "",
  });
  const project = await post(page, "./api/v1/projects", {
    mission_id: mission.id,
    name: `A11y projet ${suffix}`,
    description: "",
  });
  const architecture = await post(page, "./api/v1/architectures", {
    project_id: project.id,
    company_id: client.id,
    name: `A11y SI ${suffix}`,
    description: "",
    lifecycle: "CURRENT",
  });
  await post(page, "./api/v1/domains", {
    company_id: client.id,
    name: `A11y API ${suffix}`,
    kind: "SERVICE",
    description: "",
    lifecycle: "CURRENT",
    architecture_id: architecture.id,
  });
  const document = await post(page, "./api/v1/documents", {
    project_id: project.id,
    title: `A11y doc ${suffix}`,
    content_md: "# Titre\n\nUn paragraphe et une liste :\n\n- un\n- deux\n",
  });

  const pages: [string, string, RegExp | string][] = [
    ["home", "./", /Bonjour|Hello/],
    ["year", "./agenda/2026", "2026"],
    ["month", "./agenda/2026/11", /novembre|November/i],
    ["day", "./agenda/2026/11/4", /novembre|November/i],
    ["week", "./agenda/week/2026-11-02", /Semaine|Week/],
    ["standup", "./agenda/standup", /Standup/],
    ["missions", "./missions", /Missions/],
    ["mission", `./missions/${mission.id}`, `A11y mission ${suffix}`],
    ["project", `./missions/${mission.id}/projects/${project.id}`, `A11y doc ${suffix}`],
    [
      "project architectures",
      `./missions/${mission.id}/projects/${project.id}/architectures`,
      `A11y SI ${suffix}`,
    ],
    ["documents", "./documents", /Documents/],
    ["document", `./documents/${document.id}`, "Un paragraphe et une liste"],
    ["architecture", `./architecture/architectures/${architecture.id}`, `A11y SI ${suffix}`],
    ["graph", `./architecture/architectures/${architecture.id}/graph`, `A11y API ${suffix}`],
    ["contacts", "./directory/contacts", /Contacts/],
    ["companies", "./directory/companies", /Entreprises|Companies/],
    ["settings", "./settings", /Paramètres|Settings/],
    ["data", "./settings/data", /Exporter mes données|Export my data/],
  ];
  const violations: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate((value) => {
      window.localStorage.setItem("mantine-color-scheme-value", value);
    }, scheme);
    for (const [name, url, marker] of pages) {
      await page.goto(url);
      await expect(page.getByText(marker).first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      violations.push(...(await audit(page, `${name} (${scheme})`)));
    }
  }
  expect(violations).toEqual([]);
});

test("the month grid works with the keyboard alone (P12-3)", async ({ page }) => {
  await signIn(page, "./agenda/2026/11");
  const grid = page.getByRole("grid", { name: /mois|month/i });
  await grid
    .getByRole("button", { name: /^lundi 2 novembre, matin|^Monday 2 November, morning/ })
    .focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("data-slot", "2026-11-03|PM");
  await page.keyboard.press("Enter");
  await expect(focused).toHaveAttribute("aria-pressed", "true");
});
