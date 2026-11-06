import { expect, type Page, test } from "./fixtures";
import { freeMonth, signIn } from "./helpers";

const suffix = Date.now().toString(36);
async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("a mission month in 3 days on site, 2 remote, filled in three clicks", async ({ page }) => {
  await signIn(page);
  // A month nobody filled yet: the e2e database keeps every run's agenda.
  const { year, month, last: lastDay } = await freeMonth(page);
  const mm = String(month).padStart(2, "0");
  const client = await post(page, "./api/v1/companies", { name: `Template client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", {
    name: `Template ESN ${suffix}`,
    types: ["ESN"],
  });
  const title = `Template mission ${suffix}`;
  const mission = await post(page, "./api/v1/missions", {
    title,
    job_title: "Dev",
    client_id: client.id,
    employer_company_id: esn.id,
    // Only this month: another run's template is never proposed here.
    start_date: `${year}-${mm}-01`,
    planned_end_date: `${year}-${mm}-${lastDay}`,
    objectives: "",
    description: "",
    review: "",
  });

  // The template is built in the editor.
  await page.goto("./agenda/templates");
  await page.getByRole("button", { name: "Nouvelle semaine type" }).first().click();
  await page.getByRole("dialog").getByRole("textbox", { name: "Nom" }).fill(`3/2 ${suffix}`);
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  const grid = page.getByRole("grid", { name: "Semaine type" });
  for (const day of ["lundi", "mardi", "mercredi"]) {
    for (const period of ["matin", "après-midi"]) {
      await grid.getByRole("button", { name: `${day}, ${period} : Non saisi` }).click();
    }
  }
  await page.getByRole("combobox", { name: "Lieu de travail" }).click();
  await page.getByRole("option", { name: "Sur site chez le client" }).click();
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  for (const day of ["jeudi", "vendredi"]) {
    for (const period of ["matin", "après-midi"]) {
      await grid.getByRole("button", { name: `${day}, ${period} : Non saisi` }).click();
    }
  }
  await page.getByRole("combobox", { name: "Lieu de travail" }).click();
  await page.getByRole("option", { name: "Télétravail depuis la maison" }).click();
  await page.getByRole("button", { name: "Appliquer", exact: true }).click();
  await page.getByRole("combobox", { name: "Mission par défaut" }).click();
  await page.getByRole("option", { name: title }).click();
  await page.getByRole("button", { name: "Enregistrer la semaine type" }).click();
  await expect(page.getByText("Enregistré")).toBeVisible();
  const saved = await (
    await page.request.get(`./api/v1/agenda/week-templates?mission_id=${mission.id}`)
  ).json();
  expect(saved[0].slots).toHaveLength(10);

  // Three clicks: the mission's template, preview, apply.
  await page.goto(`./agenda/${year}/${month}`);
  await page.getByRole("button", { name: `Appliquer « 3/2 ${suffix} »` }).click();
  const dialog = page.getByRole("dialog", { name: "Appliquer une semaine type" });
  await dialog.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(dialog.getByText(/^Remplies : \d+$/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Appliquer \(\d+ demi-journées\)$/ }).click();
  await expect(dialog).toBeHidden();

  await expect(
    page.getByRole("button", { name: new RegExp(`^lundi \\d+ [^,]+, matin : ${title}$`) }).first(),
  ).toBeVisible();
  const monthHalfDays = await (
    await page.request.get(
      `./api/v1/agenda/half-days?from=${year}-${mm}-01&to=${year}-${mm}-${lastDay}`,
    )
  ).json();
  // Public holidays of the month are kept as they are (ADR-0035).
  const locations = new Set(
    monthHalfDays
      .filter((h: { kind: string }) => h.kind === "MISSION")
      .map((h: { location: string; mission_id: string }) => `${h.mission_id}|${h.location}`),
  );
  expect(locations).toEqual(new Set([`${mission.id}|CLIENT_ON_SITE`, `${mission.id}|REMOTE_HOME`]));
  // RG-10: applying again changes nothing.
  await page.getByRole("button", { name: `Appliquer « 3/2 ${suffix} »` }).click();
  await dialog.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(dialog.getByText(/^Déjà identiques : \d+$/)).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /^Appliquer \(0 demi-journée\)$/ }),
  ).toBeDisabled();
});
