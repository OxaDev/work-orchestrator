import { expect, type Page, test } from "./fixtures";
import { freeTuesday, signIn } from "./helpers";

const suffix = Date.now().toString(36);
async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("a morning: settle yesterday, plan today, write blockers, copy the standup", async ({
  page,
}) => {
  await signIn(page);
  // A free week: the e2e database keeps every run's agenda (RG-04 would refuse our tasks).
  const tuesday = await freeTuesday(page);
  const year = Number(tuesday.slice(0, 4));
  const wednesday = new Date(Date.parse(`${tuesday}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

  const client = await post(page, "./api/v1/companies", { name: `Standup client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", {
    name: `Standup ESN ${suffix}`,
    types: ["ESN"],
  });
  const mission = await post(page, "./api/v1/missions", {
    title: `Standup mission ${suffix}`,
    job_title: "Dev",
    client_id: client.id,
    employer_company_id: esn.id,
    start_date: `${year}-01-01`,
    planned_end_date: `${year}-12-31`,
    objectives: "",
    description: "",
    review: "",
  });
  const subject = await post(page, "./api/v1/subjects", {
    title: `Release ${suffix}`,
    scope: "MISSION",
    mission_id: mission.id,
    status: "OPEN",
    description: "",
  });
  // Yesterday's plan; the empty half-day is filled as a mission half-day (ADR-0034).
  for (const title of ["Revue de code", "Démo client"]) {
    await post(page, "./api/v1/agenda/tasks", {
      date: tuesday,
      period: "AM",
      subject_id: subject.id,
      title,
      kind: "TASK",
      duration_minutes: 60,
      status: "PLANNED",
      description: "",
      participant_ids: [],
    });
  }

  await page.goto(`./agenda/standup?date=${wednesday}`);
  await expect(page.getByRole("heading", { name: /^La dernière fois : mardi/ })).toBeVisible();

  await page.getByRole("button", { name: "Marquer Revue de code comme faite" }).click();
  await expect(page.getByRole("button", { name: /^Revue de code .*Faite/ })).toBeVisible();
  await page.getByRole("button", { name: "Reporter Démo client" }).click();
  await expect(page.getByRole("button", { name: /^Démo client .*Reportée/ })).toBeVisible();

  // Plan today with the quick entry; the subject is offered for the empty half-day.
  await page.getByRole("button", { name: "Planifier une tâche" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouvelle tâche" });
  await dialog.getByRole("combobox", { name: "Sujet" }).click();
  await page.getByRole("option", { name: `Release ${suffix}` }).click();
  await dialog.getByRole("textbox", { name: "Intitulé" }).fill("Préparer la release");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  await page
    .getByRole("textbox", { name: "Blocages" })
    .fill("Environnement de recette indisponible");
  await page.getByRole("button", { name: "Enregistrer le journal" }).click();

  const text = page.getByRole("textbox", { name: "Mon standup" });
  await expect(text).toHaveValue(/- Revue de code \(Release/);
  await expect(text).toHaveValue(/Aujourd'hui :\n(- .*\n)*- Préparer la release/);
  await expect(text).toHaveValue(/- Démo client/);
  await expect(text).toHaveValue(/Blocages :\n- Environnement de recette indisponible/);

  // The week view shows the plan, inside mission half-days.
  await page.getByRole("link", { name: "Semaine", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Préparer la release/ })).toBeVisible();
  await expect(
    page.getByRole("region", {
      name: new RegExp(`mercredi .*, matin : Standup mission ${suffix}`),
    }),
  ).toBeVisible();
});
