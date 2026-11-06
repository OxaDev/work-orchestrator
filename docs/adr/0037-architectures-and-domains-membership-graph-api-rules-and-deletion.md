# ADR-0037: Architectures and domains — membership, graph API, rules and deletion

- **Status**: Accepted
- **Date**: 2026-11-06
- **Deciders**: Project owner
- **Source**: roadmap phase P8 (tickets P8-1 to P8-12); Q-H1 to Q-H9, Q-G5
- **Tags**: domain, backend, frontend
- **Related**: ADR-0010, ADR-0022, ADR-0023, ADR-0025, ADR-0036 · **Supersedes**: none

## Context

ADR-0022 fixes single-parent domain trees and typed relations; ADR-0023 fixes ownership by a client
company, the domain kinds and lifecycles, many-to-many links with missions and architectures,
`ExternalLink` and `SubjectDomain`. Still open: whether an architecture lists every domain or only
top ones, what the graph endpoint returns and filters, which cross-company links are refused,
what deleting a domain does to its relations and links, and the criticality scale.

## Decision drivers

- An architecture of ~100 domains is entered without ticking every sub-domain
- Never mix two clients' information (ADR-0023)
- The P9 graph view and Mermaid export read one stable endpoint

## Considered options

1. **Membership**: an architecture holds chosen domains and, implicitly, their whole subtree (chosen) vs. every domain listed explicitly (tedious, drifts when a sub-domain is added).
2. **Deleting a domain**: refuse while it has sub-domains, cascade its own relations, technologies, subject links, external links and document attachments (chosen) vs. refuse while anything references it (blocks routine cleanup) vs. cascade sub-domains (loses a subtree by mistake).
3. **Graph filters**: hidden kinds drop the node and attach its children to the nearest kept ancestor (chosen) vs. dropping the whole subtree (hides relevant leaves).

## Decision

- **Module** `app/modules/architecture`. Personal data (`OwnedMixin`, ADR-0010) attached to a client `company_id`: `Architecture(name unique per owner and company, description, lifecycle, archived_at)`, `MissionArchitecture`, `Domain(parent_id, name, kind, description, criticality ∈ {LOW, MEDIUM, HIGH, CRITICAL}?, lifecycle, owner_org_unit_id?, referent_contact_id?, archived_at)`, `ArchitectureDomain`, `DomainRelation(source_id, target_id, type, label, protocol, sync_mode, lifecycle, description)`, `DomainTechnology(version)`, `SubjectDomain`, `ExternalLink(entity_type ∈ {DOMAIN, MISSION, SUBJECT}, entity_id, kind ∈ {REPOSITORY, TICKETS, ENVIRONMENT, DOCUMENTATION, MONITORING, OTHER}, label, url)`.
- **Company rules** (`422 DOMAIN_COMPANY_MISMATCH`): parent, architecture member, relation ends, owner org unit all belong to the domain's company; a subject linked to a domain, when scoped to a mission, belongs to that mission's client. A mission links only architectures of its client (`422 ARCHITECTURE_COMPANY_MISMATCH`).
- **Tree** (RG-08): cycles refused with `TREE_CYCLE_DETECTED`; sibling names unique (`NAME_ALREADY_USED`); moving a domain moves its subtree. **Relations** (RG-09): no self-relation (`RELATION_SELF`, plus a DB check), `CUSTOM` needs a label (`RELATION_LABEL_REQUIRED`).
- **Membership**: an architecture's domains are its members plus all their descendants.
- **Graph**: `GET /architectures/{id}/graph?depth=&include_relations=&kinds=&lifecycles=` returns `{nodes: [{id, parent_id, name, kind, lifecycle, criticality, depth, member}], edges: [...]}`; `depth` counts levels below members (none = unlimited); `parent_id` is the nearest kept ancestor in the graph; edges join two kept nodes. `GET /domains/{id}/ancestors` and `/descendants` use `app/shared/tree.py`.
- **Deletion**: domain as option 2; architecture deletion keeps its domains (they belong to the company) and drops its document attachments; deleting an org unit that owns a domain is refused (`ENTITY_REFERENCED`). Mission or subject deletion drops their external links.
- **Documents**: `domain` and `architecture` join the linkable entity types (ADR-0036).
- **UI**: `/architecture` (architectures by client), `/architecture/architectures/:id` (description, domain tree, members), `/architecture/domains/:id` (domain sheet: sub-domains, relations in and out, technologies, owner with its org chain, linked subjects and their tasks, external links, documents); mission tab "Architectures"; one icon per kind (Q-H3).
- **Seed**: a demo architecture of 25 domains on 3 levels and 30 relations for the demo client.

## Rationale

Explicit listing of every domain is tedious and drifts. Refusing deletion while relations exist
makes cleanup painful; cascading sub-domains loses work silently. Dropping whole subtrees on a kind
filter would hide the very leaves (databases, queues) a filter is used to look at.

## Consequences

- **Positive**: fast entry of large architectures; a single graph contract for P9
- **Negative**: a sub-domain cannot be excluded from an architecture that includes its parent; implicit membership must be explained in the UI
- **Follow-ups**: P9 graph view and Mermaid export; P10 mission dashboard

## Compliance

`tests/integration/test_architecture.py` (company rules, RG-08, RG-09, membership, graph filters, deletion, isolation), `tests/integration/test_domain_tree_performance.py` (12 levels, 500 domains); frontend `architecture.test.tsx`; e2e `architecture.spec.ts`.
