import { Select, type SelectProps } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { LinkType } from "../../components/markdown";
import { type LinkSearchResult, searchLinks } from "./api";

const ATTACHABLE: LinkType[] = [
  "mission",
  "subject",
  "company",
  "contact",
  "technology",
  "document",
];

/** Remote search over linkable entities; `value` is "type:id". */
export function EntityPicker({
  onPick,
  ...props
}: Omit<SelectProps, "data" | "onChange" | "value"> & {
  onPick: (entity: LinkSearchResult) => void;
}) {
  const { t } = useTranslation("documents");
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 250);
  const results = useQuery({
    queryKey: ["links-search", debounced],
    queryFn: () => searchLinks(debounced, ATTACHABLE),
    enabled: debounced.trim().length > 0,
  });
  const items = results.data ?? [];
  return (
    <Select
      searchable
      clearable
      value={null}
      filter={({ options }) => options}
      searchValue={search}
      onSearchChange={setSearch}
      nothingFoundMessage={debounced ? t("entities.nothing") : undefined}
      data={items.map((item) => ({
        value: `${item.type}:${item.id}`,
        label: `${item.label} — ${t(`types.${item.type}`)}`,
      }))}
      onChange={(value) => {
        const item = items.find((i) => `${i.type}:${i.id}` === value);
        if (item) {
          onPick(item);
          setSearch("");
        }
      }}
      {...props}
    />
  );
}
