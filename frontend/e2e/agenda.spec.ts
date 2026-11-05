import { expect, test } from "@playwright/test";

import { signIn } from "./helpers";

const suffix = Date.now().toString(36);

test("assign two weeks to a mission, pose a week of leave, see it in the year view", async ({
  page,
}) => {
  await signIn(page);
  const client = await (
    await page.request.post("./api/v1/companies", { data: { name: `Agenda client ${suffix}` } })
  ).json();
  const esn = await (
    await page.request.post("./api/v1/companies", {
      data: { name: `Agenda ESN ${suffix}`, types: ["ESN"] },
    })
  ).json();
  const title = `Agenda mission ${suffix}`;
  await page.request.post("./api/v1/missions", {
    data: {
      title,
      job_title: "Dev",
      client_id: client.id,
      employer_company_id: esn.id,
      start_date: "2030-01-01",
      planned_end_date: "2030-12-31",
      objectives: "",
      description: "",
      review: "",
    },
  });

  // Two weeks of mission, selected with click + shift-click (P4-9).
  await page.goto("./agenda/2030/3");
  await page.getByRole("button", { name: /lundi 4 mars, matin/ }).click();
  await page
    .getByRole("button", { name: /vendredi 15 mars, après-midi/ })
    .click({ modifiers: ["Shift"] });
  await expect(page.getByText("24 demi-journées sélectionnées")).toBeVisible();
  await page.getByRole("combobox", { name: "Mission" }).click();
  await page.getByRole("option", { name: title }).click();
  await page.getByRole("button", { name: "Appliquer" }).click();
  await expect(page.getByRole("button", { name: `mardi 12 mars, matin : ${title}` })).toBeVisible();

  // A week of leave.
  await page.goto("./agenda/2030/4");
  await page.getByRole("button", { name: /lundi 8 avril, matin/ }).click();
  await page
    .getByRole("button", { name: /vendredi 12 avril, après-midi/ })
    .click({ modifiers: ["Shift"] });
  await page.getByRole("combobox", { name: "Nature" }).click();
  await page.getByRole("option", { name: "Congés", exact: true }).click();
  await page.getByRole("button", { name: "Appliquer" }).click();
  await expect(
    page.getByRole("button", { name: "mercredi 10 avril, matin : Congés" }),
  ).toBeVisible();

  // Public holidays are pre-filled: Easter Monday 2030 is 22 April.
  await expect(
    page.getByRole("button", { name: "lundi 22 avril, matin : Jour férié" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Année 2030" }).click();
  await expect(page.getByRole("img", { name: /mercredi 10 avril — matin : Congés/ })).toBeVisible();
  await expect(
    page.getByRole("img", { name: new RegExp(`mardi 12 mars — matin : ${title}`) }),
  ).toBeVisible();
});
