import { crc32 } from "node:zlib";

import { expect, type Page } from "@playwright/test";

export const E2E_EMAIL = process.env.E2E_EMAIL ?? "e2e-admin@example.com";
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "E2e-Admin-Pass-1";

/** Signs in through the UI; relative URLs keep the base path (ADR-0011). */
export async function signIn(page: Page, path = "./"): Promise<void> {
  await page.goto(path);
  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page.getByLabel(/^(Mot de passe|Password)$/).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /Se connecter|Sign in/ }).click();
  await expect(page.getByRole("navigation", { name: /Menu principal|Main menu/ })).toBeVisible();
}

const FIXED_HOLIDAYS = ["01-01", "05-01", "05-08", "07-14", "08-15", "11-01", "11-11", "12-25"];

const iso = (date: Date) => date.toISOString().slice(0, 10);

async function isEmpty(page: Page, from: string, to: string): Promise<boolean> {
  const response = await page.request.get(`./api/v1/agenda/half-days?from=${from}&to=${to}`);
  return response.ok() && (await response.json()).length === 0;
}

/**
 * A Tuesday (2031-2097) whose Tuesday and Wednesday hold no half-day yet, away from fixed public
 * holidays. The e2e database keeps every run's agenda: specs never assume an empty calendar.
 */
export async function freeTuesday(page: Page): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const day = new Date(Date.UTC(2031, 0, 7)); // a Tuesday
    day.setUTCDate(day.getUTCDate() + 7 * Math.floor(Math.random() * 3500));
    const wednesday = new Date(day.getTime() + 86_400_000);
    if ([day, wednesday].some((d) => FIXED_HOLIDAYS.includes(iso(d).slice(5)))) continue;
    if (await isEmpty(page, iso(day), iso(wednesday))) return iso(day);
  }
  throw new Error("No free week found in the e2e agenda");
}

/** A month (2031-2099) with no half-day yet. */
export async function freeMonth(
  page: Page,
): Promise<{ year: number; month: number; last: number }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slot = Math.floor(Math.random() * 828);
    const year = 2031 + Math.floor(slot / 12);
    const month = (slot % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const mm = String(month).padStart(2, "0");
    if (await isEmpty(page, `${year}-${mm}-01`, `${year}-${mm}-${last}`))
      return { year, month, last };
  }
  throw new Error("No free month found in the e2e agenda");
}

/** A minimal zip (stored, no compression) built in memory, e.g. a Markdown vault to import. */
export function zip(files: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? Buffer.from(content) : content;
    const path = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(path.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(path.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, path, data);
    centrals.push(central, path);
    offset += local.length + path.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
