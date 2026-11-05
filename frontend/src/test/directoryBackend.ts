/** In-memory fake of the directory API (P2) for component tests. Reset before each test. */

import { http, HttpResponse } from "msw";

import type {
  Company,
  ContactDetail,
  OrgUnit,
  Sector,
  TagWithUsage,
  Technology,
} from "../features/directory/api";

const NOW = "2026-11-05T10:00:00Z";
let sequence = 0;
const nextId = () => `00000000-0000-7000-9000-${String(++sequence).padStart(12, "0")}`;
const norm = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();

export const directory = {
  sectors: [] as Sector[],
  companies: [] as Company[],
  orgUnits: [] as OrgUnit[],
  contacts: [] as ContactDetail[],
  technologies: [] as Technology[],
  tags: [] as TagWithUsage[],
  lastBody: null as unknown,
};

export const ids = {
  finance: "",
  bank: "",
  bankCompany: "",
  esn: "",
  dsi: "",
  payments: "",
  hugo: "",
  python: "",
  critical: "",
};

export function resetDirectory(): void {
  sequence = 0;
  const finance: Sector = {
    id: nextId(),
    parent_id: null,
    name_fr: "Finance",
    name_en: "Finance",
    company_count: 0,
  };
  const bankSector: Sector = {
    id: nextId(),
    parent_id: finance.id,
    name_fr: "Banque",
    name_en: "Banking",
    company_count: 1,
  };
  const critical: TagWithUsage = { id: nextId(), name: "Critique", color: "red", usage: 1 };
  const company = (
    name: string,
    types: Company["types"],
    extra: Partial<Company> = {},
  ): Company => ({
    id: nextId(),
    name,
    types,
    primary_sector_id: null,
    secondary_sector_ids: [],
    parent_company: null,
    website: null,
    notes: "",
    tags: [],
    contact_count: 0,
    archived_at: null,
    created_at: NOW,
    ...extra,
  });
  const bank = company("Banque Horizon", ["CLIENT"], {
    primary_sector_id: bankSector.id,
    notes: "**Client historique**",
    contact_count: 1,
  });
  const esn = company("Néo Consulting", ["ESN"]);
  const dsi: OrgUnit = {
    id: nextId(),
    company_id: bank.id,
    parent_id: null,
    name: "DSI",
    level_label: "Direction",
    description: "",
  };
  const payments: OrgUnit = {
    id: nextId(),
    company_id: bank.id,
    parent_id: dsi.id,
    name: "Paiements",
    level_label: "Pôle",
    description: "",
  };
  const hugo: ContactDetail = {
    id: nextId(),
    first_name: "Hugo",
    last_name: "Lefèvre",
    job_title: "Responsable Paiements",
    email_work: "hugo@horizon.example",
    email_personal: null,
    phone_work: null,
    phone_mobile: null,
    linkedin_url: null,
    notes: "",
    company: { id: bank.id, name: bank.name },
    org_unit: { id: payments.id, name: payments.name },
    tags: [{ id: critical.id, name: critical.name, color: critical.color }],
    archived_at: null,
    created_at: NOW,
    employments: [],
  };
  const tech = (
    name: string,
    category: Technology["category"],
    aliases: string[] = [],
  ): Technology => ({
    id: nextId(),
    name,
    category,
    aliases,
    description: "",
    website: null,
    archived_at: null,
    tags: [],
  });
  const python = tech("Python", "LANGUAGE");
  Object.assign(directory, {
    sectors: [finance, bankSector],
    companies: [bank, esn],
    orgUnits: [dsi, payments],
    contacts: [hugo],
    technologies: [python, tech("Apache Kafka", "MESSAGING", ["Kafka"])],
    tags: [critical],
    lastBody: null,
  });
  Object.assign(ids, {
    finance: finance.id,
    bank: bankSector.id,
    bankCompany: bank.id,
    esn: esn.id,
    dsi: dsi.id,
    payments: payments.id,
    hugo: hugo.id,
    python: python.id,
    critical: critical.id,
  });
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });
const page = <T>(items: T[], url: URL) => {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  return HttpResponse.json({ items: items.slice(offset, offset + limit), total: items.length });
};
const visible = <T extends { archived_at: string | null }>(items: T[], url: URL) =>
  url.searchParams.get("include_archived") === "true" ? items : items.filter((i) => !i.archived_at);
const tagsOf = (tagIds: string[] | undefined) =>
  (tagIds ?? []).flatMap((id) => {
    const tag = directory.tags.find((t) => t.id === id);
    return tag ? [{ id: tag.id, name: tag.name, color: tag.color }] : [];
  });
const companySummary = (id: string | null | undefined) => {
  const company = directory.companies.find((c) => c.id === id);
  return company ? { id: company.id, name: company.name } : null;
};
const unitSummary = (id: string | null | undefined) => {
  const unit = directory.orgUnits.find((u) => u.id === id);
  return unit ? { id: unit.id, name: unit.name } : null;
};
async function body<T>(request: Request): Promise<T> {
  const parsed = (await request.json()) as T;
  directory.lastBody = parsed;
  return parsed;
}

export const directoryHandlers = [
  // sectors
  http.get("*/api/v1/sectors", () => HttpResponse.json(directory.sectors)),
  http.post("*/api/v1/sectors", async ({ request }) => {
    const data = await body<Omit<Sector, "id" | "company_count">>(request);
    const sector: Sector = {
      id: nextId(),
      company_count: 0,
      ...data,
      parent_id: data.parent_id ?? null,
    };
    directory.sectors.push(sector);
    return HttpResponse.json(sector, { status: 201 });
  }),
  http.patch("*/api/v1/sectors/:id", async ({ params, request }) => {
    const sector = directory.sectors.find((s) => s.id === params.id)!;
    Object.assign(sector, await body<Partial<Sector>>(request));
    return HttpResponse.json(sector);
  }),
  http.delete("*/api/v1/sectors/:id", ({ params }) => {
    if (directory.sectors.some((s) => s.parent_id === params.id)) {
      return error(409, "ENTITY_REFERENCED", { entity: "sector", referencedBy: "sector" });
    }
    directory.sectors = directory.sectors.filter((s) => s.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  // companies
  http.get("*/api/v1/companies", ({ request }) => {
    const url = new URL(request.url);
    const q = norm(url.searchParams.get("q") ?? "");
    const type = url.searchParams.get("type");
    const items = visible(directory.companies, url)
      .filter((c) => !q || norm(c.name).includes(q))
      .filter((c) => !type || c.types.includes(type as Company["types"][number]));
    return page(items, url);
  }),
  http.get("*/api/v1/companies/:id/org-units", ({ params }) =>
    HttpResponse.json(directory.orgUnits.filter((u) => u.company_id === params.id)),
  ),
  http.post("*/api/v1/companies/:id/org-units", async ({ params, request }) => {
    const data = await body<Omit<OrgUnit, "id" | "company_id">>(request);
    const unit: OrgUnit = {
      id: nextId(),
      company_id: String(params.id),
      ...data,
      parent_id: data.parent_id ?? null,
    };
    directory.orgUnits.push(unit);
    return HttpResponse.json(unit, { status: 201 });
  }),
  http.get("*/api/v1/companies/:id", ({ params }) => {
    const company = directory.companies.find((c) => c.id === params.id);
    return company ? HttpResponse.json(company) : error(404, "NOT_FOUND", { entity: "company" });
  }),
  http.post("*/api/v1/companies", async ({ request }) => {
    const data = await body<Record<string, unknown> & { name: string; tag_ids?: string[] }>(
      request,
    );
    if (directory.companies.some((c) => norm(c.name) === norm(data.name))) {
      return error(409, "NAME_ALREADY_USED", { entity: "company" });
    }
    const company: Company = {
      id: nextId(),
      name: data.name,
      types: (data.types as Company["types"]) ?? ["CLIENT"],
      primary_sector_id: (data.primary_sector_id as string | null) ?? null,
      secondary_sector_ids: (data.secondary_sector_ids as string[]) ?? [],
      parent_company: companySummary(data.parent_company_id as string | null),
      website: (data.website as string | null) ?? null,
      notes: (data.notes as string) ?? "",
      tags: tagsOf(data.tag_ids),
      contact_count: 0,
      archived_at: null,
      created_at: NOW,
    };
    directory.companies.push(company);
    return HttpResponse.json(company, { status: 201 });
  }),
  http.patch("*/api/v1/companies/:id", async ({ params, request }) => {
    const company = directory.companies.find((c) => c.id === params.id)!;
    const data = await body<Record<string, unknown> & { tag_ids?: string[] }>(request);
    const { tag_ids, parent_company_id, ...rest } = data;
    Object.assign(company, rest, {
      tags: tagsOf(tag_ids),
      parent_company: companySummary(parent_company_id as string),
    });
    return HttpResponse.json(company);
  }),
  http.post("*/api/v1/companies/:id/:action", ({ params }) => {
    const company = directory.companies.find((c) => c.id === params.id)!;
    company.archived_at = params.action === "archive" ? NOW : null;
    return HttpResponse.json(company);
  }),

  // organisation units
  http.patch("*/api/v1/org-units/:id", async ({ params, request }) => {
    const unit = directory.orgUnits.find((u) => u.id === params.id)!;
    Object.assign(unit, await body<Partial<OrgUnit>>(request));
    return HttpResponse.json(unit);
  }),
  http.delete("*/api/v1/org-units/:id", ({ params }) => {
    if (directory.orgUnits.some((u) => u.parent_id === params.id)) {
      return error(409, "ENTITY_REFERENCED", { entity: "orgUnit", referencedBy: "orgUnit" });
    }
    directory.orgUnits = directory.orgUnits.filter((u) => u.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

  // contacts
  http.get("*/api/v1/contacts/duplicates", ({ request }) => {
    const url = new URL(request.url);
    const key = norm(`${url.searchParams.get("first_name")} ${url.searchParams.get("last_name")}`);
    return HttpResponse.json(
      directory.contacts
        .filter((c) => c.id !== url.searchParams.get("exclude_id"))
        .filter((c) => norm(`${c.first_name} ${c.last_name}`) === key)
        .map((c) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          company: c.company,
          reason: "SAME_NAME",
        })),
    );
  }),
  http.get("*/api/v1/contacts", ({ request }) => {
    const url = new URL(request.url);
    const q = norm(url.searchParams.get("q") ?? "");
    const companyId = url.searchParams.get("company_id");
    const items = visible(directory.contacts, url)
      .filter((c) => !q || norm(`${c.first_name} ${c.last_name} ${c.job_title ?? ""}`).includes(q))
      .filter((c) => !companyId || c.company?.id === companyId);
    return page(items, url);
  }),
  http.get("*/api/v1/contacts/:id", ({ params }) => {
    const contact = directory.contacts.find((c) => c.id === params.id);
    return contact ? HttpResponse.json(contact) : error(404, "NOT_FOUND", { entity: "contact" });
  }),
  http.post("*/api/v1/contacts", async ({ request }) => {
    const data = await body<Record<string, unknown> & { tag_ids?: string[] }>(request);
    const contact: ContactDetail = {
      id: nextId(),
      first_name: data.first_name as string,
      last_name: data.last_name as string,
      job_title: (data.job_title as string | null) ?? null,
      email_work: (data.email_work as string | null) ?? null,
      email_personal: null,
      phone_work: null,
      phone_mobile: null,
      linkedin_url: null,
      notes: (data.notes as string) ?? "",
      company: companySummary(data.company_id as string | null),
      org_unit: unitSummary(data.org_unit_id as string | null),
      tags: tagsOf(data.tag_ids),
      archived_at: null,
      created_at: NOW,
      employments: [],
    };
    directory.contacts.push(contact);
    return HttpResponse.json(contact, { status: 201 });
  }),
  http.patch("*/api/v1/contacts/:id", async ({ params, request }) => {
    const contact = directory.contacts.find((c) => c.id === params.id)!;
    const { tag_ids, company_id, org_unit_id, ...rest } = await body<
      Record<string, unknown> & { tag_ids?: string[] }
    >(request);
    Object.assign(contact, rest, {
      tags: tagsOf(tag_ids),
      company: companySummary(company_id as string),
      org_unit: unitSummary(org_unit_id as string),
    });
    return HttpResponse.json(contact);
  }),
  http.post("*/api/v1/contacts/:id/employments", async ({ params, request }) => {
    const contact = directory.contacts.find((c) => c.id === params.id)!;
    const data = await body<{
      company_id: string;
      job_title: string | null;
      start_date: string | null;
      end_date: string | null;
    }>(request);
    if (data.start_date && data.end_date && data.end_date < data.start_date)
      return error(422, "INVALID_DATE_RANGE");
    contact.employments.push({
      id: nextId(),
      company: companySummary(data.company_id)!,
      job_title: data.job_title,
      start_date: data.start_date,
      end_date: data.end_date,
    });
    return HttpResponse.json(contact, { status: 201 });
  }),
  http.delete("*/api/v1/contacts/:id/employments/:employmentId", ({ params }) => {
    const contact = directory.contacts.find((c) => c.id === params.id)!;
    contact.employments = contact.employments.filter((e) => e.id !== params.employmentId);
    return HttpResponse.json(contact);
  }),
  http.post("*/api/v1/contacts/:id/:action", ({ params }) => {
    const contact = directory.contacts.find((c) => c.id === params.id)!;
    contact.archived_at = params.action === "archive" ? NOW : null;
    return HttpResponse.json(contact);
  }),

  // technologies
  http.get("*/api/v1/technologies", ({ request }) => {
    const url = new URL(request.url);
    const q = norm(url.searchParams.get("q") ?? "");
    const category = url.searchParams.get("category");
    const items = visible(directory.technologies, url)
      .filter((t) => !q || norm([t.name, ...t.aliases].join(" ")).includes(q))
      .filter((t) => !category || t.category === category);
    return page(items, url);
  }),
  http.post("*/api/v1/technologies", async ({ request }) => {
    const data = await body<Technology & { tag_ids?: string[] }>(request);
    const technology: Technology = {
      ...data,
      id: nextId(),
      archived_at: null,
      tags: tagsOf(data.tag_ids),
      website: data.website ?? null,
    };
    directory.technologies.push(technology);
    return HttpResponse.json(technology, { status: 201 });
  }),
  http.patch("*/api/v1/technologies/:id", async ({ params, request }) => {
    const technology = directory.technologies.find((t) => t.id === params.id)!;
    const { tag_ids, ...rest } = await body<Partial<Technology> & { tag_ids?: string[] }>(request);
    Object.assign(technology, rest, { tags: tagsOf(tag_ids) });
    return HttpResponse.json(technology);
  }),
  http.post("*/api/v1/technologies/:id/:action", ({ params }) => {
    const technology = directory.technologies.find((t) => t.id === params.id)!;
    technology.archived_at = params.action === "archive" ? NOW : null;
    return HttpResponse.json(technology);
  }),

  // tags
  http.get("*/api/v1/tags", () => HttpResponse.json(directory.tags)),
  http.post("*/api/v1/tags", async ({ request }) => {
    const data = await body<{ name: string; color: string }>(request);
    if (directory.tags.some((t) => norm(t.name) === norm(data.name))) {
      return error(409, "NAME_ALREADY_USED", { entity: "tag" });
    }
    const tag = { id: nextId(), usage: 0, ...data };
    directory.tags.push(tag);
    return HttpResponse.json({ id: tag.id, name: tag.name, color: tag.color }, { status: 201 });
  }),
  http.patch("*/api/v1/tags/:id", async ({ params, request }) => {
    const tag = directory.tags.find((t) => t.id === params.id)!;
    Object.assign(tag, await body<Partial<TagWithUsage>>(request));
    return HttpResponse.json({ id: tag.id, name: tag.name, color: tag.color });
  }),
  http.delete("*/api/v1/tags/:id", ({ params }) => {
    directory.tags = directory.tags.filter((t) => t.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
