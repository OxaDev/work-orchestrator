/** Small directory widgets shared by pages: tag badges and inputs, entity selects. */

import { Badge, Group, MultiSelect, Select, type SelectProps } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { flattenTree, buildTree } from "../../components/tree";
import { type Tag, useCompanies, useOrgUnits, useSaveTag, useSectors, useTags } from "./api";

export function TagBadges({ tags }: { tags: readonly Tag[] }) {
  if (tags.length === 0) return null;
  return (
    <Group gap={4}>
      {tags.map((tag) => (
        <Badge key={tag.id} color={tag.color} variant="light" size="sm">
          {tag.name}
        </Badge>
      ))}
    </Group>
  );
}

interface TagInputProps {
  value: string[];
  onChange: (ids: string[]) => void;
}

/** Multi-select of existing tags; typing a new name creates the tag on the fly. */
export function TagInput({ value, onChange }: TagInputProps) {
  const { t } = useTranslation("directory");
  const tags = useTags();
  const save = useSaveTag();
  const data = (tags.data ?? []).map((tag) => ({ value: tag.id, label: tag.name }));

  return (
    <MultiSelect
      label={t("tags.label")}
      placeholder={t("tags.placeholder")}
      data={data}
      value={value}
      searchable
      clearable
      nothingFoundMessage={t("tags.createHint")}
      onChange={onChange}
      onKeyDown={(event) => {
        const input = event.currentTarget as HTMLInputElement;
        const name = input.value.trim();
        if (event.key !== "Enter" || !name) return;
        if (data.some((d) => d.label.toLowerCase() === name.toLowerCase())) return;
        event.preventDefault();
        save.mutate({ name, color: "gray" }, { onSuccess: (tag) => onChange([...value, tag.id]) });
      }}
    />
  );
}

type EntitySelectProps = Omit<SelectProps, "data">;

export function CompanySelect({ esnOnly, ...props }: EntitySelectProps & { esnOnly?: boolean }) {
  const companies = useCompanies({ limit: 200, ...(esnOnly ? { type: "ESN" } : {}) });
  return (
    <Select
      searchable
      clearable
      data={(companies.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
      {...props}
    />
  );
}

export function SectorSelect(props: EntitySelectProps) {
  const { i18n } = useTranslation();
  const sectors = useSectors();
  const label = (s: { name_fr: string; name_en: string }) =>
    i18n.language === "en" ? s.name_en : s.name_fr;
  const rows = flattenTree(
    buildTree(sectors.data ?? [], (a, b) => label(a).localeCompare(label(b))),
  );
  return (
    <Select
      searchable
      clearable
      data={rows.map((node) => ({
        value: node.item.id,
        label: `${"— ".repeat(node.depth)}${label(node.item)}`,
      }))}
      {...props}
    />
  );
}

export function SectorMultiSelect(props: {
  label: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { i18n } = useTranslation();
  const sectors = useSectors();
  return (
    <MultiSelect
      searchable
      clearable
      data={(sectors.data ?? []).map((s) => ({
        value: s.id,
        label: i18n.language === "en" ? s.name_en : s.name_fr,
      }))}
      {...props}
    />
  );
}

export function OrgUnitSelect({
  companyId,
  ...props
}: EntitySelectProps & { companyId: string | null | undefined }) {
  const units = useOrgUnits(companyId);
  const rows = flattenTree(buildTree(units.data ?? [], (a, b) => a.name.localeCompare(b.name)));
  return (
    <Select
      searchable
      clearable
      disabled={!companyId}
      data={rows.map((node) => ({
        value: node.item.id,
        label: `${"— ".repeat(node.depth)}${node.item.name}`,
      }))}
      {...props}
    />
  );
}
