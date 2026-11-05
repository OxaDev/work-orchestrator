/** TanStack Query hooks for the directory referentials (P2). */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../../api/client";
import type { components, operations } from "../../api/schema";

type S = components["schemas"];
export type Sector = S["SectorRead"];
export type Company = S["CompanyRead"];
export type CompanyType = S["CompanyType"];
export type CompanyCreate = S["CompanyCreate"];
export type CompanyUpdate = S["CompanyUpdate"];
export type OrgUnit = S["OrgUnitRead"];
export type Contact = S["ContactRead"];
export type ContactDetail = S["ContactDetail"];
export type ContactCreate = S["ContactCreate"];
export type ContactUpdate = S["ContactUpdate"];
export type Duplicate = S["DuplicateCandidate"];
export type Technology = S["TechnologyRead"];
export type TechnologyCategory = S["TechnologyCategory"];
export type TechnologyCreate = S["TechnologyCreate"];
export type TechnologyUpdate = S["TechnologyUpdate"];
export type Tag = S["TagRead"];
export type TagWithUsage = S["TagWithUsage"];

export type CompanyQuery = NonNullable<
  operations["list_companies_api_v1_companies_get"]["parameters"]["query"]
>;
export type ContactQuery = NonNullable<
  operations["list_contacts_api_v1_contacts_get"]["parameters"]["query"]
>;
export type TechnologyQuery = NonNullable<
  operations["list_technologies_api_v1_technologies_get"]["parameters"]["query"]
>;

export const COMPANY_TYPES: CompanyType[] = ["CLIENT", "ESN", "OTHER"];
export const TECHNOLOGY_CATEGORIES: TechnologyCategory[] = [
  "LANGUAGE",
  "FRAMEWORK",
  "LIBRARY",
  "DATABASE",
  "MESSAGING",
  "CLOUD",
  "INFRASTRUCTURE",
  "DEVOPS",
  "OBSERVABILITY",
  "SECURITY",
  "DATA",
  "TOOL",
  "METHOD",
  "OTHER",
];

const keys = {
  sectors: ["sectors"] as const,
  companies: ["companies"] as const,
  orgUnits: (companyId: string) => ["companies", companyId, "org-units"] as const,
  contacts: ["contacts"] as const,
  technologies: ["technologies"] as const,
  tags: ["tags"] as const,
};

/** Invalidates everything a directory change can affect (counts, summaries, tags). */
function useInvalidate() {
  const queryClient = useQueryClient();
  return (...groups: (readonly unknown[])[]) =>
    Promise.all(groups.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

// --- sectors ---------------------------------------------------------------------------------

export function useSectors() {
  return useQuery({
    queryKey: keys.sectors,
    queryFn: () => unwrap(api.GET("/api/v1/sectors")),
    staleTime: 5 * 60_000,
  });
}

export function useSaveSector() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & S["SectorCreate"]) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/sectors/{sector_id}", { params: { path: { sector_id: id } }, body }),
          )
        : unwrap(api.POST("/api/v1/sectors", { body })),
    onSuccess: () => invalidate(keys.sectors),
  });
}

export function useDeleteSector() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/sectors/{sector_id}", { params: { path: { sector_id: id } } })),
    onSuccess: () => invalidate(keys.sectors),
  });
}

// --- companies -------------------------------------------------------------------------------

export function useCompanies(query: CompanyQuery = {}) {
  return useQuery({
    queryKey: [...keys.companies, "list", query],
    queryFn: () => unwrap(api.GET("/api/v1/companies", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: [...keys.companies, id],
    queryFn: () =>
      unwrap(api.GET("/api/v1/companies/{company_id}", { params: { path: { company_id: id! } } })),
    enabled: Boolean(id),
  });
}

export function useCreateCompany() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CompanyCreate) => unwrap(api.POST("/api/v1/companies", { body })),
    onSuccess: () => invalidate(keys.companies, keys.sectors, keys.tags),
  });
}

export function useUpdateCompany(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CompanyUpdate) =>
      unwrap(
        api.PATCH("/api/v1/companies/{company_id}", { params: { path: { company_id: id } }, body }),
      ),
    onSuccess: () => invalidate(keys.companies, keys.sectors, keys.tags, keys.contacts),
  });
}

export function useArchiveCompany(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (archived: boolean) =>
      unwrap(
        archived
          ? api.POST("/api/v1/companies/{company_id}/archive", {
              params: { path: { company_id: id } },
            })
          : api.POST("/api/v1/companies/{company_id}/restore", {
              params: { path: { company_id: id } },
            }),
      ),
    onSuccess: () => invalidate(keys.companies),
  });
}

// --- organisation ----------------------------------------------------------------------------

export function useOrgUnits(companyId: string | null | undefined) {
  return useQuery({
    queryKey: keys.orgUnits(companyId ?? ""),
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/companies/{company_id}/org-units", {
          params: { path: { company_id: companyId! } },
        }),
      ),
    enabled: Boolean(companyId),
  });
}

export function useSaveOrgUnit(companyId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & S["OrgUnitCreate"]) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/org-units/{unit_id}", { params: { path: { unit_id: id } }, body }),
          )
        : unwrap(
            api.POST("/api/v1/companies/{company_id}/org-units", {
              params: { path: { company_id: companyId } },
              body,
            }),
          ),
    onSuccess: () => invalidate(keys.orgUnits(companyId)),
  });
}

export function useDeleteOrgUnit(companyId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/org-units/{unit_id}", { params: { path: { unit_id: id } } })),
    onSuccess: () => invalidate(keys.orgUnits(companyId)),
  });
}

// --- contacts --------------------------------------------------------------------------------

export function useContacts(query: ContactQuery = {}) {
  return useQuery({
    queryKey: [...keys.contacts, "list", query],
    queryFn: () => unwrap(api.GET("/api/v1/contacts", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useContact(id: string | undefined) {
  return useQuery({
    queryKey: [...keys.contacts, id],
    queryFn: () =>
      unwrap(api.GET("/api/v1/contacts/{contact_id}", { params: { path: { contact_id: id! } } })),
    enabled: Boolean(id),
  });
}

export function useDuplicates(
  firstName: string,
  lastName: string,
  emails: string[],
  excludeId?: string,
) {
  const enabled = firstName.trim().length > 0 && lastName.trim().length > 0;
  return useQuery({
    queryKey: [...keys.contacts, "duplicates", firstName, lastName, emails, excludeId],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/contacts/duplicates", {
          params: {
            query: {
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: emails.filter(Boolean),
              exclude_id: excludeId,
            },
          },
        }),
      ),
    enabled,
  });
}

export function useCreateContact() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ContactCreate) => unwrap(api.POST("/api/v1/contacts", { body })),
    onSuccess: () => invalidate(keys.contacts, keys.companies, keys.tags),
  });
}

export function useUpdateContact(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ContactUpdate) =>
      unwrap(
        api.PATCH("/api/v1/contacts/{contact_id}", { params: { path: { contact_id: id } }, body }),
      ),
    onSuccess: () => invalidate(keys.contacts, keys.companies, keys.tags),
  });
}

export function useArchiveContact(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (archived: boolean) =>
      unwrap(
        archived
          ? api.POST("/api/v1/contacts/{contact_id}/archive", {
              params: { path: { contact_id: id } },
            })
          : api.POST("/api/v1/contacts/{contact_id}/restore", {
              params: { path: { contact_id: id } },
            }),
      ),
    onSuccess: () => invalidate(keys.contacts, keys.companies),
  });
}

export function useAddEmployment(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: S["EmploymentCreate"]) =>
      unwrap(
        api.POST("/api/v1/contacts/{contact_id}/employments", {
          params: { path: { contact_id: contactId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(keys.contacts),
  });
}

export function useDeleteEmployment(contactId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (employmentId: string) =>
      unwrap(
        api.DELETE("/api/v1/contacts/{contact_id}/employments/{employment_id}", {
          params: { path: { contact_id: contactId, employment_id: employmentId } },
        }),
      ),
    onSuccess: () => invalidate(keys.contacts),
  });
}

// --- technologies ----------------------------------------------------------------------------

export function useTechnologies(query: TechnologyQuery = {}) {
  return useQuery({
    queryKey: [...keys.technologies, "list", query],
    queryFn: () => unwrap(api.GET("/api/v1/technologies", { params: { query } })),
    placeholderData: keepPreviousData,
  });
}

export function useSaveTechnology() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & TechnologyCreate) =>
      id
        ? unwrap(
            api.PATCH("/api/v1/technologies/{technology_id}", {
              params: { path: { technology_id: id } },
              body,
            }),
          )
        : unwrap(api.POST("/api/v1/technologies", { body })),
    onSuccess: () => invalidate(keys.technologies, keys.tags),
  });
}

export function useArchiveTechnology() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      unwrap(
        archived
          ? api.POST("/api/v1/technologies/{technology_id}/archive", {
              params: { path: { technology_id: id } },
            })
          : api.POST("/api/v1/technologies/{technology_id}/restore", {
              params: { path: { technology_id: id } },
            }),
      ),
    onSuccess: () => invalidate(keys.technologies),
  });
}

// --- tags ------------------------------------------------------------------------------------

export function useTags() {
  return useQuery({ queryKey: keys.tags, queryFn: () => unwrap(api.GET("/api/v1/tags")) });
}

export function useSaveTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & S["TagCreate"]) =>
      id
        ? unwrap(api.PATCH("/api/v1/tags/{tag_id}", { params: { path: { tag_id: id } }, body }))
        : unwrap(api.POST("/api/v1/tags", { body })),
    onSuccess: () => invalidate(keys.tags, keys.companies, keys.contacts, keys.technologies),
  });
}

export function useDeleteTag() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE("/api/v1/tags/{tag_id}", { params: { path: { tag_id: id } } })),
    onSuccess: () => invalidate(keys.tags, keys.companies, keys.contacts, keys.technologies),
  });
}
