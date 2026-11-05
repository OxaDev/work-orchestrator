import { Button, Checkbox, Group, Stack, Textarea, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";

import { COMPANY_TYPES, type Company } from "./api";
import { CompanySelect, SectorMultiSelect, SectorSelect, TagInput } from "./components";
import type { CompanyFormValues } from "./payloads";

interface CompanyFormProps {
  company?: Company;
  submitting: boolean;
  onSubmit: (values: CompanyFormValues) => void;
}

export function CompanyForm({ company, submitting, onSubmit }: CompanyFormProps) {
  const { t } = useTranslation("directory");
  const { t: tc } = useTranslation();
  const form = useForm<CompanyFormValues>({
    initialValues: {
      name: company?.name ?? "",
      types: company?.types ?? ["CLIENT"],
      primary_sector_id: company?.primary_sector_id ?? null,
      secondary_sector_ids: company?.secondary_sector_ids ?? [],
      parent_company_id: company?.parent_company?.id ?? null,
      website: company?.website ?? "",
      notes: company?.notes ?? "",
      tag_ids: company?.tags.map((tag) => tag.id) ?? [],
    },
    validate: { name: (v) => (v.trim() ? null : t("validation.required")) },
  });

  return (
    <form noValidate onSubmit={form.onSubmit(onSubmit)}>
      <Stack>
        <TextInput label={t("companies.name")} {...form.getInputProps("name")} />
        <Checkbox.Group label={t("companies.types")} {...form.getInputProps("types")}>
          <Group mt={4}>
            {COMPANY_TYPES.map((type) => (
              <Checkbox key={type} value={type} label={t(`companyTypes.${type}`)} />
            ))}
          </Group>
        </Checkbox.Group>
        <SectorSelect
          label={t("companies.primarySector")}
          {...form.getInputProps("primary_sector_id")}
        />
        <SectorMultiSelect
          label={t("companies.secondarySectors")}
          value={form.values.secondary_sector_ids}
          onChange={(ids) => form.setFieldValue("secondary_sector_ids", ids)}
        />
        <CompanySelect label={t("companies.parent")} {...form.getInputProps("parent_company_id")} />
        <TextInput label={t("common.website")} type="url" {...form.getInputProps("website")} />
        <Textarea
          label={t("common.notes")}
          description={t("common.markdownHint")}
          autosize
          minRows={4}
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
