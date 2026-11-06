import { Navigate, type RouteObject } from "react-router";

import { RequireAdmin, RequireAuth } from "../features/auth/guards";
import { LoginPage } from "../features/auth/LoginPage";
import { AgendaIndex, AgendaMonthPage } from "../features/agenda/AgendaMonthPage";
import { AgendaYearPage } from "../features/agenda/AgendaYearPage";
import { ArchitectureHome } from "../features/architecture/ArchitectureHome";
import { ArchitecturePage } from "../features/architecture/ArchitecturePage";
import { DomainPage } from "../features/architecture/DomainPage";
import { GraphPage } from "../features/architecture/GraphPage";
import { DayPage } from "../features/agenda/DayPage";
import { StandupPage } from "../features/agenda/StandupPage";
import { SubtypesPage } from "../features/agenda/SubtypesPage";
import { TemplateEditorPage } from "../features/agenda/TemplateEditorPage";
import { TemplatesPage } from "../features/agenda/TemplatesPage";
import { WeekPage } from "../features/agenda/WeekPage";
import { CompaniesPage } from "../features/directory/CompaniesPage";
import { CompanyPage } from "../features/directory/CompanyPage";
import { ContactPage } from "../features/directory/ContactPage";
import { ContactsPage } from "../features/directory/ContactsPage";
import { CareerPage } from "../features/dashboard/CareerPage";
import { DirectoryLayout } from "../features/directory/DirectoryLayout";
import { SectorsPage } from "../features/directory/SectorsPage";
import { TagsPage } from "../features/directory/TagsPage";
import { TechnologiesPage } from "../features/directory/TechnologiesPage";
import { DocumentPage } from "../features/documents/DocumentPage";
import { DocumentsPage } from "../features/documents/DocumentsPage";
import { KnowledgeGraphPage } from "../features/documents/KnowledgeGraphPage";
import { DocumentTemplatesPage } from "../features/documents/TemplatesPage";
import { HomePage } from "../features/home/HomePage";
import { MissionPage } from "../features/missions/MissionPage";
import { MissionsPage } from "../features/missions/MissionsPage";
import { RolesPage } from "../features/missions/RolesPage";
import { ComingSoonPage } from "../features/placeholder/ComingSoonPage";
import { NotFoundPage } from "../features/placeholder/NotFoundPage";
import { DataSettings } from "../features/settings/DataSettings";
import { PasswordSettings } from "../features/settings/PasswordSettings";
import { ProfileSettings } from "../features/settings/ProfileSettings";
import { SettingsLayout } from "../features/settings/SettingsLayout";
import { UsersAdmin } from "../features/settings/UsersAdmin";
import { CategoriesPage } from "../features/subjects/CategoriesPage";
import { SubjectRedirect } from "../features/subjects/SubjectRedirect";
import { SubjectsPage } from "../features/subjects/SubjectsPage";
import { AppLayout } from "./layout/AppLayout";
import { NAV_ITEMS } from "./navigation";
import { RouteError } from "./RouteError";

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
      {
        // A page that crashes is replaced in place; the shell and its menu stay (P12-5).
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "agenda", element: <AgendaIndex /> },
          { path: "agenda/:year", element: <AgendaYearPage /> },
          { path: "agenda/:year/:month", element: <AgendaMonthPage /> },
          { path: "agenda/:year/:month/:day", element: <DayPage /> },
          { path: "agenda/week/:date", element: <WeekPage /> },
          { path: "agenda/standup", element: <StandupPage /> },
          { path: "agenda/subjects", element: <SubjectsPage /> },
          { path: "agenda/templates", element: <TemplatesPage /> },
          { path: "agenda/templates/:templateId", element: <TemplateEditorPage /> },
          { path: "architecture", element: <ArchitectureHome /> },
          { path: "architecture/architectures/:architectureId", element: <ArchitecturePage /> },
          { path: "architecture/architectures/:architectureId/graph", element: <GraphPage /> },
          { path: "architecture/domains/:domainId", element: <DomainPage /> },
          { path: "documents", element: <DocumentsPage /> },
          { path: "documents/templates", element: <DocumentTemplatesPage /> },
          { path: "documents/graph", element: <KnowledgeGraphPage /> },
          { path: "documents/:documentId", element: <DocumentPage /> },
          { path: "subjects/:subjectId", element: <SubjectRedirect /> },
          { path: "missions", element: <MissionsPage /> },
          { path: "missions/career", element: <CareerPage /> },
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
              { path: "subject-categories", element: <CategoriesPage /> },
            ],
          },
          {
            path: "settings",
            element: <SettingsLayout />,
            children: [
              { index: true, element: <ProfileSettings /> },
              { path: "password", element: <PasswordSettings /> },
              { path: "data", element: <DataSettings /> },
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
    ],
  },
];
