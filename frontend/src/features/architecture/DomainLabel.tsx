import { Anchor, Badge, Group, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { Criticality, DomainKind, Lifecycle } from "./api";
import { CRITICALITY_COLORS, KIND_ICONS, LIFECYCLE_COLORS } from "./kinds";

interface DomainLike {
  id: string;
  name: string;
  kind: DomainKind;
  lifecycle?: Lifecycle;
  criticality?: Criticality | null;
}

/** Kind icon (with its name for screen readers) and the domain name, linked to its sheet. */
export function DomainLabel({ domain, link = true }: { domain: DomainLike; link?: boolean }) {
  const { t } = useTranslation("architecture");
  const Icon = KIND_ICONS[domain.kind];
  return (
    <Group gap={6} wrap="nowrap">
      <Icon size={16} stroke={1.6} aria-label={t(`kinds.${domain.kind}`)} role="img" />
      {link ? (
        <Anchor component={Link} to={`/architecture/domains/${domain.id}`} size="sm">
          {domain.name}
        </Anchor>
      ) : (
        <Text size="sm">{domain.name}</Text>
      )}
    </Group>
  );
}

/** Lifecycle (when not current) and criticality badges. */
export function DomainBadges({ domain }: { domain: DomainLike }) {
  const { t } = useTranslation("architecture");
  return (
    <Group gap={4} wrap="nowrap">
      {domain.lifecycle && domain.lifecycle !== "CURRENT" && (
        <Badge size="xs" variant="light" color={LIFECYCLE_COLORS[domain.lifecycle]}>
          {t(`lifecycles.${domain.lifecycle}`)}
        </Badge>
      )}
      {domain.criticality && (
        <Badge size="xs" variant="outline" color={CRITICALITY_COLORS[domain.criticality]}>
          {t(`criticalities.${domain.criticality}`)}
        </Badge>
      )}
    </Group>
  );
}
