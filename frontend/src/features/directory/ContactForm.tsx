import {
  Alert,
  Anchor,
  Button,
  Group,
  List,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDebouncedValue } from "@mantine/hooks";
import { IconUsers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { type ContactDetail, useDuplicates } from "./api";
import { CompanySelect, OrgUnitSelect, TagInput } from "./components";
import type { ContactFormValues } from "./payloads";

/** Live warning about similar contacts before saving (P2-9). */
function DuplicateWarning({
  values,
  excludeId,
}: {
  values: ContactFormValues;
  excludeId?: string;
}) {
  const { t } = useTranslation("directory");
  const [debounced] = useDebouncedValue(values, 400);
  const duplicates = useDuplicates(
    debounced.first_name,
    debounced.last_name,
    [debounced.email_work, debounced.email_personal].filter((e) => e.includes("@")),
    excludeId,
  );
  if (!duplicates.data?.length) return null;
  return (
    <Alert color="yellow" icon={<IconUsers size={18} />} title={t("contacts.duplicatesTitle")}>
      <List size="sm">
        {duplicates.data.map((d) => (
          <List.Item key={d.id}>
            <Anchor component={Link} to={`/directory/contacts/${d.id}`} target="_blank">
              {d.first_name} {d.last_name}
            </Anchor>
            {d.company && ` — ${d.company.name}`} ({t(`contacts.duplicateReason.${d.reason}`)})
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}

interface ContactFormProps {
  contact?: ContactDetail;
  defaultCompanyId?: string | null;
  submitting: boolean;
  onSubmit: (values: ContactFormValues) => void;
}

export function ContactForm({ contact, defaultCompanyId, submitting, onSubmit }: ContactFormProps) {
  const { t } = useTranslation("directory");
  const { t: tc } = useTranslation();
  const emailRule = (v: string) =>
    !v.trim() || /^\S+@\S+\.\S+$/.test(v) ? null : t("validation.email");
  const form = useForm<ContactFormValues>({
    initialValues: {
      first_name: contact?.first_name ?? "",
      last_name: contact?.last_name ?? "",
      job_title: contact?.job_title ?? "",
      email_work: contact?.email_work ?? "",
      email_personal: contact?.email_personal ?? "",
      phone_work: contact?.phone_work ?? "",
      phone_mobile: contact?.phone_mobile ?? "",
      linkedin_url: contact?.linkedin_url ?? "",
      company_id: contact?.company?.id ?? defaultCompanyId ?? null,
      org_unit_id: contact?.org_unit?.id ?? null,
      notes: contact?.notes ?? "",
      tag_ids: contact?.tags.map((tag) => tag.id) ?? [],
    },
    validate: {
      first_name: (v) => (v.trim() ? null : t("validation.required")),
      last_name: (v) => (v.trim() ? null : t("validation.required")),
      email_work: emailRule,
      email_personal: emailRule,
    },
  });

  return (
    <form noValidate onSubmit={form.onSubmit(onSubmit)}>
      <Stack>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t("contacts.firstName")} {...form.getInputProps("first_name")} />
          <TextInput label={t("contacts.lastName")} {...form.getInputProps("last_name")} />
        </SimpleGrid>
        <DuplicateWarning values={form.values} excludeId={contact?.id} />
        <TextInput label={t("contacts.jobTitle")} {...form.getInputProps("job_title")} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <CompanySelect
            label={t("contacts.company")}
            {...form.getInputProps("company_id")}
            onChange={(value) => {
              form.setFieldValue("company_id", value);
              form.setFieldValue("org_unit_id", null);
            }}
          />
          <OrgUnitSelect
            label={t("contacts.orgUnit")}
            companyId={form.values.company_id}
            {...form.getInputProps("org_unit_id")}
          />
          <TextInput
            label={t("contacts.emailWork")}
            type="email"
            {...form.getInputProps("email_work")}
          />
          <TextInput
            label={t("contacts.emailPersonal")}
            type="email"
            {...form.getInputProps("email_personal")}
          />
          <TextInput label={t("contacts.phoneWork")} {...form.getInputProps("phone_work")} />
          <TextInput label={t("contacts.phoneMobile")} {...form.getInputProps("phone_mobile")} />
        </SimpleGrid>
        <TextInput label="LinkedIn" type="url" {...form.getInputProps("linkedin_url")} />
        <Textarea
          label={t("common.notes")}
          description={t("common.markdownHint")}
          autosize
          minRows={3}
          {...form.getInputProps("notes")}
        />
        <TagInput
          value={form.values.tag_ids}
          onChange={(ids) => form.setFieldValue("tag_ids", ids)}
        />
        <Group>
          <Button type="submit" loading={submitting}>
            {tc("common.save")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
