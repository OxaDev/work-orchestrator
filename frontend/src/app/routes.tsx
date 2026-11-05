import { Navigate, type RouteObject } from "react-router";

import { RequireAdmin, RequireAuth } from "../features/auth/guards";
import { LoginPage } from "../features/auth/LoginPage";
import { AgendaIndex, AgendaMonthPage } from "../features/agenda/AgendaMonthPage";
import { AgendaYearPage } from "../features/agenda/AgendaYearPage";
import { SubtypesPage } from "../features/agenda/SubtypesPage";
import { CompaniesPage } from "../features/directory/CompaniesPage";
import { CompanyPage } from "../features/directory/CompanyPage";
import { ContactPage } from "../features/directory/ContactPage";
import { ContactsPage } from "../features/directory/ContactsPage";
import { DirectoryLayout } from "../features/directory/DirectoryLayout";
import { SectorsPage } from "../features/directory/SectorsPage";
import { TagsPage } from "../features/directory/TagsPage";
import { TechnologiesPage } from "../features/directory/TechnologiesPage";
import { HomePage } from "../features/home/HomePage";
import { MissionPage } from "../features/missions/MissionPage";
import { MissionsPage } from "../features/missions/MissionsPage";
import { RolesPage } from "../features/missions/RolesPage";
import { ComingSoonPage } from "../features/placeholder/ComingSoonPage";
import { NotFoundPage } from "../features/placeholder/NotFoundPage";
import { PasswordSettings } from "../features/settings/PasswordSettings";
import { ProfileSettings } from "../features/settings/ProfileSettings";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { UsersAdmin } from "../features/settings/UsersAdmin";
import { AppLayout } from "./layout/AppLayout";
import { NAV_ITEMS } from "./navigation";

export const routes: RouteObject[] = [
  { path: "login", element: <LoginPage /> },
  {
    // Everything except the login page requires a session (ADR-0030).
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: "agenda", element: <AgendaIndex /> },
      { path: "agenda/:year", element: <AgendaYearPage /> },
      { path: "agenda/:year/:month", element: <AgendaMonthPage /> },
      { path: "missions", element: <MissionsPage /> },
      { path: "missions/:missionId", element: <MissionPage /> },
      {
        path: "directory",
        element: <DirectoryLayout />,
        children: [
          { index: true, element: <Navigate to="contacts" replace /> },
          { path: "contacts", element: <ContactsPage /> },
          { path: "contacts/:contactId", element: <ContactPage /> },
          { path: "companies", element: <CompaniesPage /> },
          { path: "companies/:companyId", element: <CompanyPage /> },
          { path: "technologies", element: <TechnologiesPage /> },
          { path: "sectors", element: <SectorsPage /> },
          { path: "tags", element: <TagsPage /> },
          { path: "roles", element: <RolesPage /> },
          { path: "day-types", element: <SubtypesPage /> },
        ],
      },
      {
        path: "settings",
        element: <SettingsLayout />,
        children: [
          { index: true, element: <ProfileSettings /> },
          { path: "password", element: <PasswordSettings /> },
          {
            path: "users",
            element: (
              <RequireAdmin>
                <UsersAdmin />
              </RequireAdmin>
            ),
          },
        ],
      },
      ...NAV_ITEMS.filter((item) => item.phase !== undefined).map((item) => ({
        path: `${item.path.slice(1)}/*`,
        element: <ComingSoonPage titleKey={item.labelKey} phase={item.phase ?? ""} />,
      })),
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
