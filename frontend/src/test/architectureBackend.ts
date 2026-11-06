/** In-memory fake of the architecture API (P8) for component tests. */

import { http, HttpResponse } from "msw";

import type {
  ArchitectureDetail,
  DomainDetail,
  DomainSummary,
  ExternalLink,
  Relation,
} from "../features/architecture/api";
import { directory, ids } from "./directoryBackend";
import { missionIds, missions } from "./missionsBackend";

let sequence = 0;
const nextId = () => `00000000-0000-7000-e000-${String(++sequence).padStart(12, "0")}`;
const NOW = "2026-11-06T10:00:00Z";

interface StoredDomain extends DomainSummary {
  description: string;
  owner_org_unit_id: string | null;
  referent_contact_id: string | null;
  technologies: DomainDetail["technologies"];
  subjects: DomainDetail["subjects"];
}

interface StoredArchitecture {
  id: string;
  company_id: string;
  name: string;
  description: string;
  lifecycle: ArchitectureDetail["lifecycle"];
  archived_at: string | null;
  members: string[];
  missions: string[];
}

export const arch = {
  architectures: [] as StoredArchitecture[],
  domains: [] as StoredDomain[],
  relations: [] as (Omit<Relation, "source" | "target"> & {
    source_id: string;
    target_id: string;
  })[],
  links: [] as ExternalLink[],
  layout: [] as { domain_id: string; x: number; y: number }[],
  mermaidQuery: "",
  lastBody: null as unknown,
  lastUrl: "",
};
export const archIds = { si: "", payments: "", hub: "", api: "", base: "", relation: "" };

function addDomain(fields: Partial<StoredDomain> & Pick<StoredDomain, "name" | "kind">) {
  const domain: StoredDomain = {
    id: nextId(),
    company_id: ids.bankCompany,
    parent_id: null,
    lifecycle: "CURRENT",
    criticality: null,
    archived_at: null,
    description: "",
    owner_org_unit_id: null,
    referent_contact_id: null,
    technologies: [],
    subjects: [],
    ...fields,
  };
  arch.domains.push(domain);
  return domain;
}

export function resetArchitecture(): void {
  sequence = 0;
  arch.domains = [];
  arch.links = [];
  arch.layout = [];
  arch.mermaidQuery = "";
  arch.lastBody = null;
  arch.lastUrl = "";
  const payments = addDomain({ name: "Paiements", kind: "BUSINESS_DOMAIN" });
  const hub = addDomain({
    name: "Hub",
    kind: "APPLICATION",
    parent_id: payments.id,
    owner_org_unit_id: ids.payments,
    criticality: "CRITICAL",
    description: "# Hub de paiements",
  });
  const api = addDomain({ name: "API", kind: "SERVICE", parent_id: hub.id });
  const base = addDomain({
    name: "Base",
    kind: "DATABASE",
    parent_id: hub.id,
    lifecycle: "TARGET",
  });
  const relation = {
    id: nextId(),
    source_id: api.id,
    target_id: base.id,
    type: "WRITES_TO" as const,
    label: null,
    protocol: "JDBC",
    sync_mode: "SYNC" as const,
    lifecycle: "CURRENT" as const,
    description: "",
  };
  arch.relations = [relation];
  const si: StoredArchitecture = {
    id: nextId(),
    company_id: ids.bankCompany,
    name: "SI Horizon",
    description: "Le **SI** de la banque.",
    lifecycle: "CURRENT",
    archived_at: null,
    members: [payments.id],
    missions: [missionIds.current],
  };
  arch.architectures = [si];
  Object.assign(archIds, {
    si: si.id,
    payments: payments.id,
    hub: hub.id,
    api: api.id,
    base: base.id,
    relation: relation.id,
  });
}

const error = (status: number, code: string, params: Record<string, unknown> = {}) =>
  HttpResponse.json({ code, detail: code, params }, { status });

const company = (id: string) => {
  const found = directory.companies.find((c) => c.id === id);
  return { id, name: found?.name ?? "?" };
};
const domainById = (id: unknown) => arch.domains.find((d) => d.id === id);
const summary = ({
  id,
  company_id,
  parent_id,
  name,
  kind,
  lifecycle,
  criticality,
  archived_at,
}: StoredDomain): DomainSummary => ({
  id,
  company_id,
  parent_id,
  name,
  kind,
  lifecycle,
  criticality,
  archived_at,
});

function descendants(id: string): StoredDomain[] {
  const children = arch.domains.filter((d) => d.parent_id === id && !d.archived_at);
  return children.flatMap((c) => [c, ...descendants(c.id)]);
}

function ancestors(domain: StoredDomain): StoredDomain[] {
  const parent = domain.parent_id ? domainById(domain.parent_id) : undefined;
  return parent ? [...ancestors(parent), parent] : [];
}

function relationRead(r: (typeof arch.relations)[number]): Relation {
  const ref = (id: string) => {
    const d = domainById(id)!;
    return { id: d.id, name: d.name, kind: d.kind };
  };
  return { ...r, source: ref(r.source_id), target: ref(r.target_id) };
}

function detail(domain: StoredDomain): DomainDetail {
  const chain: DomainDetail["owner_chain"] = [];
  for (let unit = directory.orgUnits.find((u) => u.id === domain.owner_org_unit_id); unit;) {
    chain.unshift({ id: unit.id, name: unit.name, level_label: unit.level_label });
    unit = directory.orgUnits.find((u) => u.id === unit!.parent_id);
  }
  const lineage = new Set([domain.id, ...ancestors(domain).map((a) => a.id)]);
  return {
    ...summary(domain),
    company: company(domain.company_id),
    description: domain.description,
    owner_org_unit: chain.at(-1) ?? null,
    owner_chain: chain,
    referent_contact: null,
    ancestors: ancestors(domain).map(summary),
    children: arch.domains.filter((d) => d.parent_id === domain.id).map(summary),
    outgoing: arch.relations.filter((r) => r.source_id === domain.id).map(relationRead),
    incoming: arch.relations.filter((r) => r.target_id === domain.id).map(relationRead),
    technologies: domain.technologies,
    subjects: domain.subjects,
    architectures: arch.architectures
      .filter((a) => a.members.some((m) => lineage.has(m)))
      .map((a) => ({ id: a.id, name: a.name })),
    external_links: arch.links.filter((l) => l.entity_id === domain.id),
  };
}

function architectureRead(a: StoredArchitecture): ArchitectureDetail {
  return {
    id: a.id,
    company: company(a.company_id),
    name: a.name,
    lifecycle: a.lifecycle,
    archived_at: a.archived_at,
    member_count: a.members.length,
    missions: a.missions.map((id) => ({
      id,
      name: missions.items.find((m) => m.id === id)?.title ?? "?",
    })),
    description: a.description,
    members: a.members.map((id) => summary(domainById(id)!)),
    updated_at: NOW,
  };
}

const findArchitecture = (id: unknown) => arch.architectures.find((a) => a.id === id);

export const architectureHandlers = [
  http.get("*/api/v1/architectures/:id/mermaid", ({ request }) => {
    const url = new URL(request.url);
    arch.mermaidQuery = url.search;
    const format = url.searchParams.get("format") ?? "flowchart";
    return HttpResponse.json({
      format,
      code: format === "mindmap" ? "mindmap\n    root((SI))\n" : "flowchart LR\n    a --> b\n",
    });
  }),
  http.get("*/api/v1/architectures/:id/layout", () => HttpResponse.json(arch.layout)),
  http.put("*/api/v1/architectures/:id/layout", async ({ request }) => {
    const body = (await request.json()) as { positions: typeof arch.layout };
    arch.lastBody = body;
    for (const position of body.positions) {
      arch.layout = [...arch.layout.filter((p) => p.domain_id !== position.domain_id), position];
    }
    return HttpResponse.json(arch.layout);
  }),
  http.delete("*/api/v1/architectures/:id/layout", () => {
    arch.layout = [];
    arch.lastUrl = "reset-layout";
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/architectures", ({ request }) => {
    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id");
    const missionId = url.searchParams.get("mission_id");
    return HttpResponse.json(
      arch.architectures
        .filter((a) => !companyId || a.company_id === companyId)
        .filter((a) => !missionId || a.missions.includes(missionId))
        .map(architectureRead),
    );
  }),
  http.post("*/api/v1/architectures", async ({ request }) => {
    const body = (await request.json()) as {
      company_id: string;
      name: string;
      description: string;
      lifecycle: StoredArchitecture["lifecycle"];
      mission_id: string | null;
    };
    arch.lastBody = body;
    const created: StoredArchitecture = {
      id: nextId(),
      company_id: body.company_id,
      name: body.name,
      description: body.description,
      lifecycle: body.lifecycle,
      archived_at: null,
      members: [],
      missions: body.mission_id ? [body.mission_id] : [],
    };
    arch.architectures.push(created);
    return HttpResponse.json(architectureRead(created), { status: 201 });
  }),
  http.get("*/api/v1/architectures/:id", ({ params }) => {
    const found = findArchitecture(params.id);
    return found ? HttpResponse.json(architectureRead(found)) : error(404, "NOT_FOUND");
  }),
  http.patch("*/api/v1/architectures/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<StoredArchitecture>;
    arch.lastBody = body;
    const found = findArchitecture(params.id)!;
    Object.assign(found, body);
    return HttpResponse.json(architectureRead(found));
  }),
  http.delete("*/api/v1/architectures/:id", ({ params }) => {
    arch.architectures = arch.architectures.filter((a) => a.id !== params.id);
    arch.lastUrl = `delete-architecture:${String(params.id)}`;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/architectures/:id/graph", ({ params }) => {
    const found = findArchitecture(params.id)!;
    const nodes = found.members.flatMap((m) => {
      const root = domainById(m)!;
      return [root, ...descendants(m)];
    });
    const kept = new Set(nodes.map((n) => n.id));
    return HttpResponse.json({
      architecture: { id: found.id, name: found.name },
      nodes: nodes.map((n) => ({
        id: n.id,
        parent_id: n.parent_id && kept.has(n.parent_id) ? n.parent_id : null,
        name: n.name,
        kind: n.kind,
        lifecycle: n.lifecycle,
        criticality: n.criticality,
        depth: ancestors(n).filter((a) => kept.has(a.id)).length,
        member: found.members.includes(n.id),
        owner: n.owner_org_unit_id
          ? {
              id: n.owner_org_unit_id,
              name: directory.orgUnits.find((u) => u.id === n.owner_org_unit_id)?.name ?? "?",
            }
          : null,
      })),
      edges: arch.relations.filter((r) => kept.has(r.source_id) && kept.has(r.target_id)),
    });
  }),
  http.put("*/api/v1/architectures/:id/domains/:domainId", ({ params }) => {
    const found = findArchitecture(params.id)!;
    arch.lastUrl = `member:${String(params.domainId)}`;
    if (!found.members.includes(String(params.domainId)))
      found.members.push(String(params.domainId));
    return HttpResponse.json(architectureRead(found));
  }),
  http.delete("*/api/v1/architectures/:id/domains/:domainId", ({ params }) => {
    const found = findArchitecture(params.id)!;
    arch.lastUrl = `unmember:${String(params.domainId)}`;
    found.members = found.members.filter((m) => m !== params.domainId);
    return HttpResponse.json(architectureRead(found));
  }),
  http.put("*/api/v1/architectures/:id/missions/:missionId", ({ params }) => {
    const found = findArchitecture(params.id)!;
    arch.lastUrl = `link:${String(params.missionId)}`;
    found.missions.push(String(params.missionId));
    return HttpResponse.json(architectureRead(found));
  }),
  http.delete("*/api/v1/architectures/:id/missions/:missionId", ({ params }) => {
    const found = findArchitecture(params.id)!;
    arch.lastUrl = `unlink:${String(params.missionId)}`;
    found.missions = found.missions.filter((m) => m !== params.missionId);
    return HttpResponse.json(architectureRead(found));
  }),

  http.get("*/api/v1/domains", ({ request }) => {
    const companyId = new URL(request.url).searchParams.get("company_id");
    return HttpResponse.json(
      arch.domains.filter((d) => !companyId || d.company_id === companyId).map(summary),
    );
  }),
  http.post("*/api/v1/domains", async ({ request }) => {
    const body = (await request.json()) as StoredDomain & { architecture_id: string | null };
    arch.lastBody = body;
    const { architecture_id: architectureId, ...fields } = body;
    const created = addDomain(fields);
    if (architectureId) findArchitecture(architectureId)!.members.push(created.id);
    return HttpResponse.json(detail(created), { status: 201 });
  }),
  http.get("*/api/v1/domains/:id", ({ params }) => {
    const found = domainById(params.id);
    return found ? HttpResponse.json(detail(found)) : error(404, "NOT_FOUND");
  }),
  http.patch("*/api/v1/domains/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<StoredDomain>;
    arch.lastBody = body;
    const found = domainById(params.id)!;
    Object.assign(found, body);
    return HttpResponse.json(detail(found));
  }),
  http.post("*/api/v1/domains/:id/:action", ({ params }) => {
    const found = domainById(params.id)!;
    found.archived_at = params.action === "archive" ? NOW : null;
    arch.lastUrl = String(params.action);
    return HttpResponse.json(detail(found));
  }),
  http.delete("*/api/v1/domains/:id", ({ params }) => {
    if (arch.domains.some((d) => d.parent_id === params.id)) {
      return error(409, "ENTITY_REFERENCED", { entity: "domain", referencedBy: "domain" });
    }
    arch.domains = arch.domains.filter((d) => d.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("*/api/v1/domains/:id/tasks", () => HttpResponse.json([])),
  http.put("*/api/v1/domains/:id/technologies/:techId", async ({ params, request }) => {
    const body = (await request.json()) as { version: string | null };
    arch.lastBody = body;
    const found = domainById(params.id)!;
    const tech = directory.technologies.find((t) => t.id === params.techId)!;
    found.technologies.push({
      technology: { id: tech.id, name: tech.name },
      category: tech.category,
      version: body.version,
    });
    return HttpResponse.json(detail(found));
  }),
  http.delete("*/api/v1/domains/:id/technologies/:techId", ({ params }) => {
    const found = domainById(params.id)!;
    found.technologies = found.technologies.filter((t) => t.technology.id !== params.techId);
    return HttpResponse.json(detail(found));
  }),
  http.put("*/api/v1/domains/:id/subjects/:subjectId", ({ params }) => {
    const found = domainById(params.id)!;
    arch.lastUrl = `subject:${String(params.subjectId)}`;
    found.subjects.push({
      id: String(params.subjectId),
      title: "Sujet lié",
      scope: "MISSION",
      mission_id: missionIds.current,
      status: "OPEN",
    });
    return HttpResponse.json(detail(found));
  }),
  http.delete("*/api/v1/domains/:id/subjects/:subjectId", ({ params }) => {
    const found = domainById(params.id)!;
    found.subjects = found.subjects.filter((s) => s.id !== params.subjectId);
    return HttpResponse.json(detail(found));
  }),

  http.post("*/api/v1/domain-relations", async ({ request }) => {
    const body = (await request.json()) as (typeof arch.relations)[number];
    arch.lastBody = body;
    if (body.source_id === body.target_id) return error(422, "RELATION_SELF");
    const created = { ...body, id: nextId() };
    arch.relations.push(created);
    return HttpResponse.json(relationRead(created), { status: 201 });
  }),
  http.patch("*/api/v1/domain-relations/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<(typeof arch.relations)[number]>;
    arch.lastBody = body;
    const found = arch.relations.find((r) => r.id === params.id)!;
    Object.assign(found, body);
    return HttpResponse.json(relationRead(found));
  }),
  http.delete("*/api/v1/domain-relations/:id", ({ params }) => {
    arch.relations = arch.relations.filter((r) => r.id !== params.id);
    arch.lastUrl = `delete-relation:${String(params.id)}`;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/api/v1/external-links", ({ request }) => {
    const id = new URL(request.url).searchParams.get("entity_id");
    return HttpResponse.json(arch.links.filter((l) => l.entity_id === id));
  }),
  http.post("*/api/v1/external-links", async ({ request }) => {
    const body = (await request.json()) as Omit<ExternalLink, "id">;
    arch.lastBody = body;
    const created = { ...body, id: nextId() };
    arch.links.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.delete("*/api/v1/external-links/:id", ({ params }) => {
    arch.links = arch.links.filter((l) => l.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
];
