import { expect, type Page, test } from "./fixtures";
import { freeTuesday, signIn } from "./helpers";

const suffix = Date.now().toString(36);

async function post(page: Page, url: string, data: Record<string, unknown>) {
  const response = await page.request.post(url, { data });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("an agenda day and the architecture documentation are two clicks apart (P10 DoD)", async ({
  page,
}) => {
  await signIn(page);
  const day = await freeTuesday(page);
  const year = Number(day.slice(0, 4));
  const client = await post(page, "./api/v1/companies", { name: `Dash client ${suffix}` });
  const esn = await post(page, "./api/v1/companies", {
    name: `Dash ESN ${suffix}`,
    types: ["ESN"],
  });
  const title = `Dash mission ${suffix}`;
  const mission = await post(page, "./api/v1/missions", {
    title,
    job_title: "Dev",
    client_id: client.id,
    employer_company_id: esn.id,
    start_date: `${year}-01-01`,
    planned_end_date: `${year}-12-31`,
    objectives: "",
    description: "",
    review: "",
  });
  const architecture = await post(page, "./api/v1/architectures", {
    company_id: client.id,
    name: `SI ${suffix}`,
    description: "",
    lifecycle: "CURRENT",
    mission_id: mission.id,
  });
  const domain = await post(page, "./api/v1/domains", {
    company_id: client.id,
    name: `API ${suffix}`,
    kind: "SERVICE",
    description: "",
    lifecycle: "CURRENT",
    architecture_id: architecture.id,
  });
  await post(page, "./api/v1/documents", {
    title: `Dossier d'architecture ${suffix}`,
    content_md: "",
    attach_to: { type: "architecture", id: architecture.id },
  });
  const subject = await post(page, "./api/v1/subjects", {
    title: `Contrat d'API ${suffix}`,
    scope: "MISSION",
    mission_id: mission.id,
    status: "OPEN",
    description: "",
  });
  await page.request.put(`./api/v1/domains/${domain.id}/subjects/${subject.id}`);
  const task = await post(page, "./api/v1/agenda/tasks", {
    date: day,
    period: "AM",
    subject_id: subject.id,
    title: `Revue ${suffix}`,
    kind: "TASK",
    duration_minutes: 90,
    status: "PLANNED",
    description: "",
    participant_ids: [],
  });
  await page.request.patch(`./api/v1/agenda/tasks/${task.task.id}`, { data: { status: "DONE" } });

  // Day -> architecture (1 click) -> its documents (2 clicks).
  const dayUrl = `./agenda/${year}/${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
  await page.goto(dayUrl);
  await page.getByRole("link", { name: `Architecture SI ${suffix}` }).click();
  await expect(page.getByRole("heading", { name: `SI ${suffix}`, level: 2 })).toBeVisible();
  await page.getByRole("tab", { name: "Documents" }).click();
  await expect(page.getByRole("link", { name: `Dossier d'architecture ${suffix}` })).toBeVisible();

  // The task's domain is one click from the day too; from the domain, back to the day.
  await page.goto(dayUrl);
  await page.getByRole("link", { name: `API ${suffix}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: `API ${suffix}`, level: 2 })).toBeVisible();
  await page.getByRole("tab", { name: /^Sujets/ }).click();
  await page
    .getByRole("row", { name: new RegExp(`Revue ${suffix}`) })
    .getByRole("link")
    .click();
  await expect(page.getByRole("button", { name: new RegExp(`^Revue ${suffix}`) })).toBeVisible();

  // The mission dashboard counts that time (P10-3) and the career shows the mission (P10-5).
  await page.goto(`./missions/${mission.id}`);
  await expect(page.getByRole("tab", { name: "Vue d'ensemble", selected: true })).toBeVisible();
  await expect(
    page.getByRole("listitem", { name: `Contrat d'API ${suffix} : 1 h 30, 100 %` }),
  ).toBeVisible();
  await page.goto("./missions/career");
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});
