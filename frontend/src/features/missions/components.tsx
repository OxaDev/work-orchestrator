import { Badge, ColorSwatch, Group, Select, type SelectProps } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useContacts, useTechnologies } from "../directory/api";
import { MISSION_COLORS, type MissionStatus, STATUS_COLORS, useContactRoles } from "./api";

export function StatusBadge({ status }: { status: MissionStatus }) {
  const { t } = useTranslation("missions");
  return (
    <Badge color={STATUS_COLORS[status]} variant="light">
      {t(`status.${status}`)}
    </Badge>
  );
}

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (color: string) => void;
  label: string;
}) {
  return (
    <Group gap={6} role="radiogroup" aria-label={label}>
      {MISSION_COLORS.map((color) => (
        <ColorSwatch
          key={color}
          component="button"
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          color={`var(--mantine-color-${color}-6)`}
          onClick={() => onChange(color)}
          style={{
            outline: value === color ? "2px solid var(--mantine-color-text)" : undefined,
            outlineOffset: 2,
          }}
        />
      ))}
    </Group>
  );
}

type RemoteSelectProps = Omit<SelectProps, "data" | "searchValue" | "onSearchChange">;

/** Server-side search: the directory can hold many contacts. */
export function ContactSearchSelect(props: RemoteSelectProps) {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const contacts = useContacts({ q: debounced || undefined, limit: 20 });
  return (
    <Select
      searchable
      clearable
      filter={({ options }) => options}
      searchValue={search}
      onSearchChange={setSearch}
      data={(contacts.data?.items ?? []).map((c) => ({
        value: c.id,
        label: `${c.first_name} ${c.last_name}${c.company ? ` — ${c.company.name}` : ""}`,
      }))}
      {...props}
    />
  );
}

export function TechnologySearchSelect(props: RemoteSelectProps) {
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const technologies = useTechnologies({ q: debounced || undefined, limit: 20 });
  return (
    <Select
      searchable
      clearable
      filter={({ options }) => options}
      searchValue={search}
      onSearchChange={setSearch}
      data={(technologies.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))}
      {...props}
    />
  );
}

export function RoleSelect(props: Omit<SelectProps, "data">) {
  const { i18n } = useTranslation();
  const roles = useContactRoles();
  return (
    <Select
      clearable
      searchable
      data={(roles.data ?? []).map((r) => ({
        value: r.id,
        label: i18n.language === "en" ? r.name_en : r.name_fr,
      }))}
      {...props}
    />
  );
}
