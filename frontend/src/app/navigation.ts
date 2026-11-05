import {
  IconAddressBook,
  IconBooks,
  IconBriefcase,
  IconCalendar,
  IconHome,
  IconSettings,
  IconTopologyStar3,
  type Icon,
} from "@tabler/icons-react";

export interface NavItem {
  /** Route path relative to the router basename. */
  path: string;
  /** i18n key in the `common` namespace. */
  labelKey: string;
  icon: Icon;
  /** Roadmap phase delivering the section; undefined when already available. */
  phase?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { path: "/", labelKey: "nav.home", icon: IconHome },
  { path: "/agenda", labelKey: "nav.agenda", icon: IconCalendar },
  { path: "/missions", labelKey: "nav.missions", icon: IconBriefcase },
  { path: "/architecture", labelKey: "nav.architecture", icon: IconTopologyStar3, phase: "P8" },
  { path: "/documents", labelKey: "nav.documents", icon: IconBooks, phase: "P7" },
  { path: "/directory", labelKey: "nav.directory", icon: IconAddressBook },
  { path: "/settings", labelKey: "nav.settings", icon: IconSettings },
];

export function isActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === "/") return currentPath === "/";
  return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
}
