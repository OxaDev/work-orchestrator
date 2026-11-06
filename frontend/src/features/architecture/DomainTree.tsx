import { Badge, Group, Text } from "@mantine/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { TreeList } from "../../components/TreeList";
import type { Criticality, DomainKind, Lifecycle } from "./api";
import { DomainBadges, DomainLabel } from "./DomainLabel";

export interface TreeDomain {
  id: string;
  parent_id: string | null;
  name: string;
  kind: DomainKind;
  lifecycle: Lifecycle;
  criticality: Criticality | null;
  member?: boolean;
  archived_at?: string | null;
}

/** Domains as an indented tree with kind icons (ADR-0022). */
export function DomainTree({
  domains,
  label,
  actions,
}: {
  domains: readonly TreeDomain[];
  label: string;
  actions?: (domain: TreeDomain) => ReactNode;
}) {
  const { t } = useTranslation("architecture");
  return (
    <TreeList
      aria-label={label}
      items={domains}
      compare={(a, b) => a.name.localeCompare(b.name)}
      empty={
        <Text size="sm" c="dimmed">
          {t("domains.empty")}
        </Text>
      }
      label={(domain) => (
        <Group gap="xs" wrap="nowrap">
          <DomainLabel domain={domain} />
          <DomainBadges domain={domain} />
          {domain.member && (
            <Badge size="xs" variant="dot">
              {t("architectures.member")}
            </Badge>
          )}
          {domain.archived_at && (
            <Text size="xs" c="dimmed">
              {t("archived")}
            </Text>
          )}
        </Group>
      )}
      actions={actions}
    />
  );
}
