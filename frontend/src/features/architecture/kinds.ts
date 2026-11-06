/** Visual encoding of domains (Q-H3: one icon per kind) and lifecycles. */

import {
  type Icon,
  IconApi,
  IconAppWindow,
  IconArrowsExchange,
  IconCategory,
  IconCircleDashed,
  IconDatabase,
  IconServer,
  IconWorld,
} from "@tabler/icons-react";

import type { Criticality, DomainKind, Lifecycle } from "./api";

export const KIND_ICONS: Record<DomainKind, Icon> = {
  BUSINESS_DOMAIN: IconCategory,
  APPLICATION: IconAppWindow,
  SERVICE: IconApi,
  DATABASE: IconDatabase,
  MESSAGING: IconArrowsExchange,
  EXTERNAL_SYSTEM: IconWorld,
  INFRASTRUCTURE: IconServer,
  OTHER: IconCircleDashed,
};

export const LIFECYCLE_COLORS: Record<Lifecycle, string> = {
  CURRENT: "teal",
  TARGET: "blue",
  DEPRECATED: "gray",
};

export const CRITICALITY_COLORS: Record<Criticality, string> = {
  LOW: "gray",
  MEDIUM: "yellow",
  HIGH: "orange",
  CRITICAL: "red",
};
