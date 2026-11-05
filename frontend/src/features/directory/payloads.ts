/** Form values <-> API payloads for the directory forms. */

import type { CompanyCreate, CompanyType, ContactCreate } from "./api";

export interface CompanyFormValues {
  name: string;
  types: CompanyType[];
  primary_sector_id: string | null;
  secondary_sector_ids: string[];
  parent_company_id: string | null;
  website: string;
  notes: string;
  tag_ids: string[];
}

export function toCompanyPayload(values: CompanyFormValues): CompanyCreate {
  return { ...values, name: values.name.trim(), website: values.website.trim() || null };
}

export interface ContactFormValues {
  first_name: string;
  last_name: string;
  job_title: string;
  email_work: string;
  email_personal: string;
  phone_work: string;
  phone_mobile: string;
  linkedin_url: string;
  company_id: string | null;
  org_unit_id: string | null;
  notes: string;
  tag_ids: string[];
}

const blankToNull = (value: string) => value.trim() || null;

export function toContactPayload(values: ContactFormValues): ContactCreate {
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    job_title: blankToNull(values.job_title),
    email_work: blankToNull(values.email_work),
    email_personal: blankToNull(values.email_personal),
    phone_work: blankToNull(values.phone_work),
    phone_mobile: blankToNull(values.phone_mobile),
    linkedin_url: blankToNull(values.linkedin_url),
    company_id: values.company_id,
    org_unit_id: values.org_unit_id,
    notes: values.notes,
    tag_ids: values.tag_ids,
  };
}
