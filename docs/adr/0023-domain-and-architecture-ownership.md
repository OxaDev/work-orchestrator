# ADR-0023: Domains belong to a client; architectures ↔ missions many-to-many

- **Status**: Accepted
- **Date**: 2026-11-05
- **Deciders**: Project owner (default answers)
- **Source**: Q-H1, Q-H2, Q-H3, Q-H6, Q-H8, Q-H9, Q-G5
- **Tags**: domain
- **Related**: ADR-0022, ADR-0024 · **Supersedes**: none

## Context

A technical architecture groups domains; a domain can appear in several architectures; a mission has several architectures. Two clients may each have a "Payment" domain unrelated to each other. Successive missions at the same client may enrich the same architecture.

## Decision drivers

- No accidental mixing of clients' information
- Reuse of architecture knowledge across missions at the same client

## Considered options

1. **Domains and architectures owned by a client company; architecture ↔ mission many-to-many**
2. **Architecture owned by one mission** — knowledge duplicated on mission renewal
3. **Global domains shared across clients** — confusion and confidentiality risk

## Decision

- `Architecture(company_id, name, description, lifecycle)`; `MissionArchitecture` many-to-many; an architecture may exist without mission. A mission can only link architectures of its own client.
- `Domain(company_id, parent_id, name, kind, description, criticality, lifecycle, owner_org_unit_id?, referent_contact_id?)`; `ArchitectureDomain` many-to-many restricted to the same company.
- `kind ∈ {BUSINESS_DOMAIN, APPLICATION, SERVICE, DATABASE, MESSAGING, EXTERNAL_SYSTEM, INFRASTRUCTURE, OTHER}`.
- Ownership: one `OrgUnit` (most precise known level) + optional referent `Contact`; higher levels are derived from the org tree.
- `lifecycle ∈ {CURRENT, TARGET, DEPRECATED}` on domains and relations represents as-is vs to-be; no time-travel history in V1.
- Environments, repositories, tickets: generic `ExternalLink(entity_type, entity_id, kind, label, url)`.
- `SubjectDomain` links agenda subjects to domains (many-to-many): the main bridge between the two sub-apps.

## Rationale

Option 2 forces copying when a mission is renewed; option 3 mixes clients.

## Consequences

- **Positive**: knowledge accumulates per client across missions
- **Negative**: a truly generic reference architecture must be attached to some company (e.g. the ESN)
- **Follow-ups**: P8-1 to P8-6

## Compliance

Service tests rejecting cross-company links (`DOMAIN_COMPANY_MISMATCH`).
